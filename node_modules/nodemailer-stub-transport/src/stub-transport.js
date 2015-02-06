'use strict';

var packageData = require('../package.json');
var EventEmitter = require('events').EventEmitter;
var utillib = require('util');

module.exports = function(options) {
    return new StubTransport(options);
};

function StubTransport(options) {
    EventEmitter.call(this);
    this.options = options || {};
    this.name = 'Stub';
    this.version = packageData.version;
}
utillib.inherits(StubTransport, EventEmitter);

StubTransport.prototype.send = function(mail, callback) {

    if (this.options.error) {
        setImmediate(function() {
            callback(new Error(this.error));
        }.bind(this));
        return;
    }

    var message = mail.message.createReadStream();
    var chunks = [];
    var chunklen = 0;
    var envelope = mail.data.envelope || mail.message.getEnvelope();

    this.emit('log', {
        type: 'envelope',
        message: JSON.stringify(envelope)
    });

    this.emit('envelope', envelope);

    message.on('data', function(chunk) {
        chunks.push(chunk);
        chunklen += chunk.length;

        this.emit('log', {
            type: 'message',
            message: chunk.toString()
        });

        this.emit('data', chunk.toString());
    }.bind(this));

    message.on('end', function() {
        setImmediate(function() {
            var info = {
                envelope: mail.data.envelope || mail.message.getEnvelope(),
                messageId: (mail.message.getHeader('message-id') || '').replace(/[<>\s]/g, ''),
                response: Buffer.concat(chunks, chunklen)
            };
            this.emit('end', info);
            callback(null, info);
        }.bind(this));
    }.bind(this));
};