"use strict";
const mongoose_1 = require('mongoose');
const bcryptjs_1 = require('bcryptjs');
const pepper = 'JixuYF0AUXLggGNqTP1N1DQi2fEQZgcP';
const userSchema = new mongoose_1.Schema({
    userName: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    areaCode: { type: String, required: true },
    phoneNumber: { type: String, required: true, index: true },
    endpointId: { type: String, required: true },
    sipUri: { type: String, required: true },
    sipPassword: { type: String, required: true },
    greetingUrl: { type: String },
});
userSchema.method('setPassword', function (password) {
    return new Promise((resolve, reject) => {
        bcryptjs_1.hash(password + pepper, 10, (err, hash) => {
            if (err) {
                return reject(err);
            }
            this.passwordHash = hash;
            return resolve(hash);
        });
    });
});
userSchema.method('comparePassword', function (password) {
    return new Promise((resolve, reject) => {
        bcryptjs_1.compare(password + pepper, this.passwordHash, (err, result) => {
            if (err) {
                return reject(err);
            }
            return resolve(result);
        });
    });
});
const activeCallSchema = new mongoose_1.Schema({
    createdAt: { type: Date, index: true, expires: 2 * 3600 },
    callId: { type: String, index: true },
    bridgeId: { type: String, index: true },
    from: String,
    to: String,
    user: { type: mongoose_1.Schema.Types.ObjectId, ref: 'user' }
});
const voiceMailMessageSchema = new mongoose_1.Schema({
    startTime: { type: Date, index: true },
    endTime: Date,
    mediaUrl: String,
    from: String,
    user: { type: mongoose_1.Schema.Types.ObjectId, ref: 'user' }
});
voiceMailMessageSchema.set('toJSON', { transform: (doc, ret, options) => {
        return {
            id: ret._id.toString(),
            from: ret.from,
            startTime: ret.startTime.toISOString(),
            endTime: ret.endTime.toISOString()
        };
    } });
function getModels(mongoose) {
    const defineModel = (name, schema) => {
        return (mongoose).models[name] || mongoose.model(name, schema);
    };
    return {
        user: defineModel('user', userSchema),
        activeCall: defineModel('activeCall', activeCallSchema),
        voiceMailMessage: defineModel('voiceMailMessage', voiceMailMessageSchema)
    };
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = getModels;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWxzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibW9kZWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSwyQkFBZ0QsVUFBVSxDQUFDLENBQUE7QUFDM0QsMkJBQTRCLFVBQVUsQ0FBQyxDQUFBO0FBRXZDLE1BQU0sTUFBTSxHQUFHLGtDQUFrQyxDQUFDO0FBc0NsRCxNQUFNLFVBQVUsR0FBRyxJQUFJLGlCQUFNLENBQUM7SUFDN0IsUUFBUSxFQUFFLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUU7SUFDeEQsWUFBWSxFQUFFLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFO0lBQzlDLFFBQVEsRUFBRSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRTtJQUMxQyxXQUFXLEVBQUUsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtJQUMxRCxVQUFVLEVBQUUsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUU7SUFDNUMsTUFBTSxFQUFFLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFO0lBQ3hDLFdBQVcsRUFBRSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRTtJQUM3QyxXQUFXLEVBQUUsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFO0NBQzdCLENBQUMsQ0FBQztBQUVILFVBQVUsQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFLFVBQVUsUUFBZ0I7SUFDMUQsTUFBTSxDQUFDLElBQUksT0FBTyxDQUFTLENBQUMsT0FBTyxFQUFFLE1BQU07UUFDMUMsZUFBSSxDQUFDLFFBQVEsR0FBRyxNQUFNLEVBQUUsRUFBRSxFQUFFLENBQUMsR0FBUSxF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UUFDckQsVUFBVSxFQUFFLFdBQVcsQ0FBQyxZQUFZLEVBQUUsZ0JBQWdCLENBQXVCO1FBQzdFLGdCQUFnQixFQUFFLFdBQVcsQ0FBQyxrQkFBa0IsRUFBRSxzQkFBc0IsQ0FBNkI7S0FDckcsQ0FBQztBQUNILENBQUM7QUFURDsyQkFTQyxDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtNb25nb29zZSwgTW9kZWwsIFNjaGVtYSwgRG9jdW1lbnR9IGZyb20gJ21vbmdvb3NlJztcbmltcG9ydCB7aGFzaCwgY29tcGFyZX0gZnJvbSAnYmNyeXB0anMnO1xuXG5jb25zdCBwZXBwZXIgPSAnSml4dVlGMEFVWExnZ0dOcVRQMU4xRFFpMmZFUVpnY1AnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElVc2VyIGV4dGVuZHMgRG9jdW1lbnQge1xuXHR1c2VyTmFtZTogc3RyaW5nO1xuXHRhcmVhQ29kZTogc3RyaW5nO1xuXHRwaG9uZU51bWJlcjogc3RyaW5nO1xuXHRlbmRwb2ludElkOiBzdHJpbmc7XG5cdHNpcFVyaTogc3RyaW5nO1xuXHRzaXBQYXNzd29yZDogc3RyaW5nO1xuXHRncmVldGluZ1VybDogc3RyaW5nO1xuXHRzZXRQYXNzd29yZChwYXNzd29yZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+O1xuXHRjb21wYXJlUGFzc3dvcmQocGFzc3dvcmQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFjdGl2ZUNhbGwgZXh0ZW5kcyBEb2N1bWVudCB7XG5cdGNyZWF0ZWRBdDogRGF0ZTtcblx0Y2FsbElkOiBzdHJpbmc7XG5cdGJyaWRnZUlkOiBzdHJpbmc7XG5cdGZyb206IHN0cmluZztcblx0dG86IHN0cmluZztcblx0dXNlcjogSVVzZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZvaWNlTWFpbE1lc3NhZ2UgZXh0ZW5kcyBEb2N1bWVudCB7XG5cdHVzZXI6IElVc2VyO1xuXHRzdGFydFRpbWU6IERhdGU7XG5cdGVuZFRpbWU6ICAgRGF0ZTtcblx0bWVkaWFVcmw6ICBzdHJpbmc7XG5cdGZyb206ICAgICAgc3RyaW5nO1xufVxuXG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1vZGVscyB7XG5cdHVzZXI6IE1vZGVsPElVc2VyPjtcblx0YWN0aXZlQ2FsbDogTW9kZWw8SUFjdGl2ZUNhbGw+O1xuXHR2b2ljZU1haWxNZXNzYWdlOiBNb2RlbDxJVm9pY2VNYWlsTWVzc2FnZT47XG59XG5cbmNvbnN0IHVzZXJTY2hlbWEgPSBuZXcgU2NoZW1hKHtcblx0dXNlck5hbWU6IHsgdHlwZTogU3RyaW5nLCByZXF1aXJlZDogdHJ1ZSwgdW5pcXVlOiB0cnVlIH0sXG5cdHBhc3N3b3JkSGFzaDogeyB0eXBlOiBTdHJpbmcsIHJlcXVpcmVkOiB0cnVlIH0sXG5cdGFyZWFDb2RlOiB7IHR5cGU6IFN0cmluZywgcmVxdWlyZWQ6IHRydWUgfSxcblx0cGhvbmVOdW1iZXI6IHsgdHlwZTogU3RyaW5nLCByZXF1aXJlZDogdHJ1ZSwgaW5kZXg6IHRydWUgfSxcblx0ZW5kcG9pbnRJZDogeyB0eXBlOiBTdHJpbmcsIHJlcXVpcmVkOiB0cnVlIH0sXG5cdHNpcFVyaTogeyB0eXBlOiBTdHJpbmcsIHJlcXVpcmVkOiB0cnVlIH0sXG5cdHNpcFBhc3N3b3JkOiB7IHR5cGU6IFN0cmluZywgcmVxdWlyZWQ6IHRydWUgfSxcblx0Z3JlZXRpbmdVcmw6IHsgdHlwZTogU3RyaW5nIH0sXG59KTtcblxudXNlclNjaGVtYS5tZXRob2QoJ3NldFBhc3N3b3JkJywgZnVuY3Rpb24gKHBhc3N3b3JkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0aGFzaChwYXNzd29yZCArIHBlcHBlciwgMTAsIChlcnI6IGFueSwgaGFzaDogYW55KSA9PiB7XG5cdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdHJldHVybiByZWplY3QoZXJyKTtcblx0XHRcdH1cblx0XHRcdHRoaXMucGFzc3dvcmRIYXNoID0gaGFzaDtcblx0XHRcdHJldHVybiByZXNvbHZlKGhhc2gpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG51c2VyU2NoZW1hLm1ldGhvZCgnY29tcGFyZVBhc3N3b3JkJywgZnVuY3Rpb24gKHBhc3N3b3JkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+ICB7XG5cdHJldHVybiBuZXcgUHJvbWlzZTxib29sZWFuPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29tcGFyZShwYXNzd29yZCArIHBlcHBlciwgdGhpcy5wYXNzd29yZEhhc2gsIChlcnI6IGFueSwgcmVzdWx0OiBib29sZWFuKSA9PiB7XG5cdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdHJldHVybiByZWplY3QoZXJyKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXNvbHZlKHJlc3VsdCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbmNvbnN0IGFjdGl2ZUNhbGxTY2hlbWEgPSBuZXcgU2NoZW1hKHtcblx0Y3JlYXRlZEF0OiB7dHlwZTogRGF0ZSwgaW5kZXg6IHRydWUsIGV4cGlyZXM6IDIgKiAzNjAwfSxcblx0Y2FsbElkOiB7dHlwZTogU3RyaW5nLCBpbmRleDogdHJ1ZX0sXG5cdGJyaWRnZUlkOiB7dHlwZTogU3RyaW5nLCBpbmRleDogdHJ1ZX0sXG5cdGZyb206IFN0cmluZyxcblx0dG86IFN0cmluZyxcblx0dXNlcjogIHt0eXBlOiBTY2hlbWEuVHlwZXMuT2JqZWN0SWQsIHJlZjogJ3VzZXInfVxufSk7XG5cblxuY29uc3Qgdm9pY2VNYWlsTWVzc2FnZVNjaGVtYSA9IG5ldyBTY2hlbWEoe1xuXHRzdGFydFRpbWU6IHt0eXBlOiBEYXRlLCBpbmRleDogdHJ1ZX0sXG5cdGVuZFRpbWU6ICAgRGF0ZSxcblx0bWVkaWFVcmw6ICBTdHJpbmcsXG5cdGZyb206ICAgICAgU3RyaW5nLFxuXHR1c2VyOiAge3R5cGU6IFNjaGVtYS5UeXBlcy5PYmplY3RJZCwgcmVmOiAndXNlcid9XG59KTtcblxudm9pY2VNYWlsTWVzc2FnZVNjaGVtYS5zZXQoJ3RvSlNPTicsIHt0cmFuc2Zvcm06IChkb2M6IGFueSwgcmV0OiBhbnksIG9wdGlvbnM6IGFueSk6IGFueSA9PiB7XG5cdHJldHVybiB7XG5cdFx0aWQ6IHJldC5faWQudG9TdHJpbmcoKSxcblx0XHRmcm9tOiByZXQuZnJvbSxcblx0XHRzdGFydFRpbWU6IHJldC5zdGFydFRpbWUudG9JU09TdHJpbmcoKSxcblx0XHRlbmRUaW1lOiByZXQuZW5kVGltZS50b0lTT1N0cmluZygpXG5cdH07XG59fSk7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGdldE1vZGVscyhtb25nb29zZTogTW9uZ29vc2UpOiBJTW9kZWxzIHtcblx0Y29uc3QgZGVmaW5lTW9kZWwgPSAobmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYSk6IGFueSA9PiB7XG5cdFx0cmV0dXJuICg8YW55Pihtb25nb29zZSkpLm1vZGVsc1tuYW1lXSB8fCBtb25nb29zZS5tb2RlbChuYW1lLCBzY2hlbWEpO1xuXHR9O1xuXHRyZXR1cm4ge1xuXHRcdHVzZXI6IGRlZmluZU1vZGVsKCd1c2VyJywgdXNlclNjaGVtYSkgYXMgTW9kZWw8SVVzZXI+LFxuXHRcdGFjdGl2ZUNhbGw6IGRlZmluZU1vZGVsKCdhY3RpdmVDYWxsJywgYWN0aXZlQ2FsbFNjaGVtYSkgYXMgTW9kZWw8SUFjdGl2ZUNhbGw+LFxuXHRcdHZvaWNlTWFpbE1lc3NhZ2U6IGRlZmluZU1vZGVsKCd2b2ljZU1haWxNZXNzYWdlJywgdm9pY2VNYWlsTWVzc2FnZVNjaGVtYSkgYXMgTW9kZWw8SVZvaWNlTWFpbE1lc3NhZ2U+XG5cdH07XG59XG4iXX0=