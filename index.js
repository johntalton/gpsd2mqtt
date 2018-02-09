"use strict";

const Url = require('url');
const Listener = require('node-gpsd').Listener;
const mqtt = require('mqtt');

function tearUp() {
  console.log(' -- tearUp');
  listener.watch();
  listener.on('TPV', foo => { console.log('TPV'); client.publish('gpsd/tpv', JSON.stringify(foo)); });
  listener.on('INFO', foo => { console.log('INFO', foo); });
  listener.on('DEVICE', foo => { console.log('DEVICE', foo); });
  listener.on('DEVICES', foo => { console.log('DEVICES', foo); client.publish('gpsd/devices', JSON.stringify(foo)); });
  listener.on('SKY', foo => { console.log('SKY', foo); client.publish('gpsd/sky', JSON.stringify(foo)); });
}

function tearDown() {
  console.log('-- tearDown');
  //if(listener.isConnected()) { console.log('disconnect listener'); listener.disconnect(); }

  listener.unwatch();
}

let timer;
function gpsdStartReconnect() {
  if(timer) { console.log('timer already exists !!'); return; }
  timer = setInterval(() => {
    console.log('gpsd reconnect');
    listener.connect();
  }, 1000 * 9);
}

function gpsdClearReconnect() {
  if(timer) {
    clearInterval(timer);
    timer = undefined;
  }
}

//const client  = mqtt.connect('mqtt://test.mosquitto.org');
if(!process.env.mqtturl) { console.log('unspecified mqtt url'); process.exit(-1); }
const client = mqtt.connect(process.env.mqtturl, { reconnectPeriod: 1000 * 11 });

client.on('connect', () => {
  console.log('mqtt up');

  if(listener.isConnected()) {
    tearUp();
  }
});
client.on('reconnect', () => { console.log('mqtt Reconnect'); });
client.on('close', () => { console.log('mqtt Close'); });
client.on('offline', () => { console.log('mqtt Offline'); if(listener.isConnected()) { tearDown(); } });
client.on('error', error => { console.log('error', error); });


//console.log(process.env.gpsdurl);
if(!process.env.gpsdurl) { console.log('unspecified gpsd url'); process.exit(-1); }
const url = Url.parse(process.env.gpsdurl);
const hostname = url.hostname ? url.hostname : url.href;
const port = url.port ? url.port : 2947;

console.log(hostname, port);
const listener = new Listener({
  hostname: hostname,
  port: port,
    logger: {
      info: console.log,
      warn: console.log,
      error: console.log
    }
  });

listener.on('connected', () => { console.log('gpsd Up'); if(client.connected) { gpsdClearReconnect(); tearUp(); } });
listener.on('disconnected', () => { console.log('gpsd Down'); gpsdStartReconnect() });
listener.on('error', error => { console.log('gpsd Error', error); });
listener.on('error.connection', error => { console.log('gpsd Connection Error'); gpsdStartReconnect(); });
listener.on('error.socket', error => { console.log('gpsd Socket Error', error); });

listener.connect();

console.log('Running...');
