var Joi = require("joi");
var Hapi = require("hapi");
var boom = require("boom");
var path = require("path");
var catapult = require("node-bandwidth");
var config = require("./config.json");
var thenifyAll = require("thenify-all");
var randomstring = require("randomstring");
var fs = require("mz/fs");
var debug = require("debug")("voice");
var NunjucksHapi = require('nunjucks-hapi');
var Promise = require("bluebird");

var server = new Hapi.Server(); //server instance

// configure Catapult API
if(config.environment && config.environment != "prod"){
	catapult.Client.globalOptions.apiEndPoint = "https://api." + config.environment + ".catapult.inetwork.com";
}

catapult.Client.globalOptions.userId = config.catapultUserId;
catapult.Client.globalOptions.apiToken = config.catapultApiToken;
catapult.Client.globalOptions.apiSecret = config.catapultApiSecret;
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

// file to store users data
var usersPath = path.join(__dirname, "users.json");

// users data
var users = {};
var domain = null;

// active bridges
var bridges = {};

function saveUsers() {
	return fs.writeFile(usersPath, JSON.stringify(users));
}

function createUser(user) {
	return Application.create({
			name: user.userName,
			incomingCallUrl: config.baseUrl + "/users/" + encodeURIComponent(user.userName) + "/callback",
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
			// save a created user
			users[user.userName] = user;
			saveUsers();
			return user;
		});
}

function formatUser(user) {
	var k, u = {};
	for (k in user) {
		if (k === "password" || k === "application") continue;
		u[k] = user[k];
	}
	return u;
}

// Catapult's event handler
function processEvent(ev, user) {
	// Determine the type of event and handle accordingly
	if (ev.eventType === "incomingcall") {
		return handleIncomingCall(ev, user);
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


function handleIncomingCall(ev, user) {
	var callbackUrl = config.baseUrl + "/users/" + encodeURIComponent(user.userName) + "/callback";

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
					fileUrl: config.baseUrl + "/static/sounds/ring.mp3",
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

function getOrCreateUser(user) {
	if (users[user.userName]) {
		// user already exists, use the existing endpoint
		return Promise.resolve(users[user.userName]);
	} else {
		return createUser(user);
	}
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
		getOrCreateUser(user)
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
				if(config.environment && config.environment != "prod"){
					webrtcEnv = "-"+ config.environment;
				}

				var realm = user.endpoint.credentials.realm;

				reply.view("calldemo", {
					username: user.endpoint.name,
					authToken: authToken.token,
					authTokenDisplayData: JSON.stringify(authToken, null, 3),
					userData: JSON.stringify(user, null, 3),
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
		//create an application for user
		createUser(user)
			.then(function() {
				reply(formatUser(user)).created(config.baseUrl + "/users/" + encodeURIComponent(user.userName));
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
		var user = users[req.params.userName];
		if (user) {
			return reply(formatUser(user));
		}
		reply(boom.notFound());
	}
});


//PUT /users/{userName}
server.route({
	path: "/users/{userName}",
	method: "PUT",
	handler: function(req, reply) {
		var k, body = req.payload || {};
		var user = users[req.params.userName];
		if (user) {
			for (k in body) {
				user[k] = body[k];
			}
			return saveUsers().then(function() {
				reply("");
			}, function(err) {
				reply(err);
			});
		}
		reply(boom.notFound());
	}
});


//DELETE /users/{userName}
server.route({
	path: "/users/{userName}",
	method: "DELETE",
	handler: function(req, reply) {
		var user = users[req.params.userName];
		if (user) {
			var phoneNumber = user.phoneNumber;
			delete users[req.params.userName];
			return saveUsers()
				.then(function() {
					return PhoneNumber.get(phoneNumber);
				})
				.then(function(number) {
					if (number) {
						return number.delete();
					}
				})
				.then(function() {
					reply("");
				}, function(err) {
					reply(err);
				});
		}
		reply(boom.notFound());
	}
});


//POST /users/{userName}/callback
server.route({
	path: "/users/{userName}/callback",
	method: "POST",
	handler: function(req, reply) {
		var user = users[req.params.userName];
		if (user) {
			var ev = req.payload;
			debug(ev);
			return processEvent(ev, user).then(function() {
				reply("");
			}, function(err) {
				console.error("Callback error:" + err.message);
				reply("");
			});
		}
		reply(boom.notFound());
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

fs.exists(usersPath)
	.then(function(exists) {
		if (exists) {
			debug("Read users data from json file");
			return fs.readFile(usersPath);
		}
		return "{}";
	})
	.then(function(json) {
		debug("Parse users json data");
		users = JSON.parse(json);
		debug("Loaded %d users", Object.keys(users).length);
		return Domain.list();
	})
	.then(function(domains) {
		var dm = domains.filter(function(d) {
			return d.name === config.domain;
		})[0];
		if (dm) {
			debug("Using existing domain %s", dm.name);
			return dm;
		}
		debug("Creating a domain %s", config.domain);
		return Domain.create({
			name: config.domain
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
