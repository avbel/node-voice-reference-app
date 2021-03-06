var Joi = require("joi");
var Hapi = require("hapi");
var boom = require("boom");
var path = require("path");
var catapult = require("node-bandwidth");
var thenifyAll = require("thenify-all");
var randomstring = require("randomstring");
var debug = require("debug")("voice");
var NunjucksHapi = require('nunjucks-hapi');
var Promise = require("bluebird");
var mongoose = require("mongoose");
var Url = require("url");

var server = new Hapi.Server(); //server instance

// configure Catapult API
if( process.env.CATAPULT_ENVIRONMENT &&  process.env.CATAPULT_ENVIRONMENT !== "prod"){
	catapult.Client.globalOptions.apiEndPoint = "https://api." + process.env.CATAPULT_ENVIRONMENT + ".catapult.inetwork.com";
}

catapult.Client.globalOptions.apiToken = process.env.CATAPULT_API_TOKEN;
catapult.Client.globalOptions.apiSecret = process.env.CATAPULT_API_SECRET;
catapult.Client.globalOptions.userId = process.env.CATAPULT_USER_ID;

mongoose.connect(process.env.MONGODB_URI || process.env.MONGOLAB_URI || "mongodb://localhost/voice-reference-app");
mongoose.connection.on("error", console.error.bind(console, "connection error:"));

//wrap Catapult API functions. Make them thenable (i.e. they will use Promises intead of callbacks)
var Application = thenifyAll(catapult.Application);
var AvailableNumber = thenifyAll(catapult.AvailableNumber);
var PhoneNumber = thenifyAll(catapult.PhoneNumber);
var Domain = thenifyAll(catapult.Domain);
var EndPoint = thenifyAll(catapult.EndPoint);
var Call = thenifyAll(catapult.Call);
var Bridge = thenifyAll(catapult.Bridge);
catapult.PhoneNumber.prototype = thenifyAll(catapult.PhoneNumber.prototype);
catapult.Domain.prototype = thenifyAll(catapult.Domain.prototype);
catapult.Call.prototype = thenifyAll(catapult.Call.prototype);
catapult.Bridge.prototype = thenifyAll(catapult.Bridge.prototype);
thenifyAll.withCallback(server, server, ["start", "register"]);


// db model User
var User = mongoose.model("User", new mongoose.Schema({
	userName: {type: String, index: true},
	endpoint: {}
}, {strict: false}));

server.connection({
	port: process.env.PORT || 3000,
	host: process.env.HOST || "0.0.0.0"
});

// set up templates
server.views({
	engines: {
		html: NunjucksHapi
	},
	path: path.join(__dirname, 'views')
})


var domain = null;

// active bridges
var bridges = {};


function createUser(user, baseUrl) {
	return Application.create({
			name: user.userName,
			incomingCallUrl: baseUrl + "/users/" + encodeURIComponent(user.userName) + "/callback",
			autoAnswer: false
		})
		.then(function(application) {
			user.application = application;
			//search an available number
			return AvailableNumber.searchLocal({
				state: "NC",
				quantity: 1
			});
		})
		.then(function(numbers) {
			// and reserve it
			user.phoneNumber = numbers[0].number;
			return PhoneNumber.create({
				number: user.phoneNumber,
				applicationId: user.application.id
			});
		})
		.then(function() {
			//create an endpoint
			return domain.createEndPoint({
				name: "uep-" + randomstring.generate(12),
				description: "Sandbox created Endpoint for user " + user.userName,
				domainId: domain.id,
				applicationId: user.application.id,
				enabled: true,
				credentials: {
					password: user.password
				}
			});
		})
		.then(function(endpoint) {
			user.endpoint = endpoint;
			//remove 'specific' data to be saved
			delete user.application.client;
			delete user.endpoint.client;
			// save a created user to db
			return new User(user).save();
		});
}

function formatUser(user) {
	var k, u = {};
	for (k in user) {
		if (k === "password" || k === "application" || k[0] === "_") continue;
		u[k] = user[k];
	}
	return u;
}

// Catapult's event handler
function processEvent(req, ev, user) {
	// Determine the type of event and handle accordingly
	if (ev.eventType === "incomingcall") {
		return handleIncomingCall(ev, user, getBaseUrl(req));
	}
	else if (ev.eventType === "answer") {
		return handleAnswer(ev, user);
	}
	else if (ev.eventType === "hangup") {
		return handleHangup(ev, user);
	}
	else {
		return Promise.reject();
	}
}


function handleIncomingCall(ev, user, baseUrl) {
	var callbackUrl = baseUrl + "/users/" + encodeURIComponent(user.userName) + "/callback";

	var toNumber = ev.to;
	var fromNumber = ev.from;

	if (user.phoneNumber === ev.to) {
		// This is an incoming call to the user's endpoint
		toNumber = user.endpoint.sipUri;
	}
	else {
		fromNumber = user.phoneNumber
	}

	// If it has a tag, it's the answer for the outbound call leg to the user's endpoint
	if (ev.tag) {
		return Promise.resolve(); // <-- Do we need to answer the call here?
	}
	else {
		// Get the actual call object
		return Call.get(ev.callId).then(function(call) {
			// Answer the call so that we can put it in the bridge
			return call.answerOnIncoming().then(function() {
				// Play ringing until the user picks up
				call.playAudio({
					fileUrl: baseUrl + "/static/sounds/ring.mp3",
					loopEnabled: true
				});
			});
		}).then(function() {
			// Create a bridge with the inbound call
			return Bridge.create({
				callIds: [ev.callId],
				bridgeAudio: true
			});
		})
		.then(function(bridge) {
			bridges[ev.callId] = bridge.id;
			// Create the outbound leg of the call to the user's endpoint
			// Include the bridgeId in this call
			return Call.create({
				from: fromNumber,
				to: toNumber,
				bridgeId: bridge.id,
				callbackUrl: callbackUrl,
				tag: ev.callId
			})
			.then(function(call) {
				bridges[call.id] = bridge.id
			});
		});
	}
}

function handleAnswer(ev, user) {
	// We actually don't need to do anything here because the bridge was
	// already set up when we created the call
	return Promise.resolve();
}

function handleHangup(ev, user) {
	// Lookup the bridge by the callId
	var bridgeId = bridges[ev.callId];
	if (!bridgeId) {
		// If this call was not on a bridge no action is needed
		return Promise.resolve();
	}

	// Otherwise, we need to get the bridge and hangup the other end
	return Bridge.get(bridgeId)
		.then(function(bridge) {
			// Get the other call(s) on the bridge
			return bridge.getCalls();
		})
		.then(function(calls) {
			return Promise.all(calls.map(function(c) {
				// Remove the callId from the bridges object
				delete bridges[c.id];
				if (c.state === "active") {
					// If the call is still active hang it up
					debug("Hangup another call");
					return c.hangUp();
				}
			}));
		});
}


function getBaseUrl(req){
        return req.connection.info.protocol + '://' + req.info.host;	
}

// Logs

server.ext("onPreHandler", function(req, reply) {
	server.log(["body"], req.method.toUpperCase() + " " + req.url.path + " request data: " + JSON.stringify(req.payload || {}));
	reply.continue();
});


server.ext("onPostHandler", function(req, reply) {
	server.log(["body"], req.method.toUpperCase() + " " + req.url.path + " response data: " + JSON.stringify(req.response.source || {}));
	reply.continue();
});

// Routes

//GET /
server.route({
	path: "/",
	method: "GET",
	handler: function(req, reply) {
		reply.file('index.html');
	}
});

function getOrCreateUser(user, baseUrl) {
	return User.findOne({userName: user.userName})
	.then(function(dbUser){
		if(dbUser) {
			// user already exists, use the existing endpoint
			return dbUser;
		}
		return createUser(user, baseUrl);
	});
}

//GET /
server.route({
	path: "/login",
	method: "post",
	handler: function(req, reply) {
		// Give user random password
		var user = {
			userName: req.payload.userName,
			password: (Math.random() + 1).toString(36).substring(7)
		};
		getOrCreateUser(user, getBaseUrl(req))
			.then(function(endPointuser) {
				console.log("USER:", endPointuser);
				user = endPointuser;
				return domain.getEndPoint(user.endpoint.id);
			})
			.then(function(endpoint) {
				return new Promise(function(resolve, reject) {
					endpoint.createAuthToken(function(err, data) {
						if (err) {
							reject(err);
						}
						resolve(data);
					});
				});
			})
			.then(function(authToken) {
				console.log("username:", user.endpoint.name);
				console.log("authToken:", authToken.token);

				var webrtcEnv = "";
				if( process.env.CATAPULT_ENVIRONMENT &&  process.env.CATAPULT_ENVIRONMENT !== "prod"){
					webrtcEnv = "-" + process.env.CATAPULT_ENVIRONMENT;
				}

				var realm = user.endpoint.credentials.realm;

				reply.view("calldemo", {
					username: user.endpoint.name,
					authToken: authToken.token,
					authTokenDisplayData: JSON.stringify(authToken, null, 3),
					userData: JSON.stringify(user.toJSON({versionKey: false}), null, 3),
					phoneNumber: user.phoneNumber,
					webrtcEnv: webrtcEnv,
					domain: realm
				});
			});
	}
});


//POST /users
server.route({
	path: "/users",
	method: "POST",
	handler: function(req, reply) {
		var user = req.payload;
		var baseUrl = getBaseUrl(req);
		//create an application for user
		createUser(user, baseUrl)
			.then(function() {
				reply(formatUser(user)).created(baseUrl + "/users/" + encodeURIComponent(user.userName));
			})
			.catch(function(err) {
				reply(err);
			});
	},
	config: {
		validate: {
			payload: Joi.object().keys({
				userName: Joi.string().required(),
				password: Joi.string().required()
			})
		}
	}
});



//GET /users/{userName}
server.route({
	path: "/users/{userName}",
	method: "GET",
	handler: function(req, reply) {
		reply(User.findOne({userName: req.params.userName})
		.then(function(dbUser){
			if(dbUser){
				return formatUser(dbUser);
			}
			return boom.notFound();
		}));
	}
});


//PUT /users/{userName}
server.route({
	path: "/users/{userName}",
	method: "PUT",
	handler: function(req, reply) {
		var k, body = req.payload || {};
		reply(User.findOne({userName: req.params.userName})
		.then(function(user){
			if (user) {
				for (k in body) {
					user[k] = body[k];
				}
				return user.save().then(function() {
					return "";
				});
			}
			return boom.notFound();
		}));
	}
});


//DELETE /users/{userName}
server.route({
	path: "/users/{userName}",
	method: "DELETE",
	handler: function(req, reply) {
		reply(User.findOne({userName: req.params.userName})
		.then(function(user){
			if (user) {
				var phoneNumber = user.phoneNumber;
				return user.remove()
				.then(function() {
					return PhoneNumber.get(phoneNumber);
				})
				.then(function(number) {
					if (number) {
						return number.delete();
					}
				})
				.then(function() {
					return "";
				});
			}
			return boom.notFound();
		}));
	}
});


//POST /users/{userName}/callback
server.route({
	path: "/users/{userName}/callback",
	method: "POST",
	handler: function(req, reply) {
		reply(User.findOne({userName: req.params.userName})
		.then(function(user){
			if (user) {
				var ev = req.payload;
				debug(ev);
				return processEvent(req, ev, user).then(function() {
					return "";
				}, function(err) {
					if(err){
					  	console.error("Callback error:" + err.message);
					}
					return "";
				});
			}
			return boom.notFound();
		}));
	}
});

//static file server
server.route({
	method: 'GET',
	path: '/static/{param*}',
	handler: {
		directory: {
			path: 'static'
		}
	}
});

Domain.list()
	.then(function(domains) {
		var dm = domains.filter(function(d) {
			return d.name === process.env.CATAPULT_DOMAIN_NAME;
		})[0];
		if (dm) {
			debug("Using existing domain %s", dm.name);
			return dm;
		}
		debug("Creating a domain %s", process.env.CATAPULT_DOMAIN_NAME);
		return Domain.create({
			name: process.env.CATAPULT_DOMAIN_NAME
		});
	})
	.then(function(d) {
		domain = d;
		return server.register({
			register: require("good"),
			options: {
				opsInterval: 10000,
				reporters: [{
					reporter: require("good-console"),
					events: {
						log: "*",
						response: "*",
						request: "*",
						error: "*"
					}
				}]
			}
		});
	})
	.then(function() {
		debug("Start the server");
		return server.start();
	})
	.then(function() {
		console.log("Server running at:", server.info.uri);
	})
	.catch(function(err) {
		return console.error(err);
	});
