"use strict";

var nodeLifx   = require('node-lifx');
//var _          = require('lodash');
var LightItem  = require('./lifx-light.js');

var inherits      = require('util').inherits;  
var EventEmitter  = require('events').EventEmitter;


/**
 * Create new light server
 * @param {object} config Configuraion
 */
function LightServer(config) {
  var self = this;

  self.config = {};

  self.config.name      = config.name;
  self.config.address   = config.address;
  self.config.broadcast = config.broadcast;
  self.config.lights    = config.lights;
  self.config.interval  = config.interval;

  // Convert from string
  if (typeof self.config.interval === 'string')
    self.config.interval = parseInt(self.config.interval, 10);
  
  // Ensure that we don't use to low poll interval
  if (typeof self.config.interval !== 'number' || isNaN(self.config.interval) || self.interval < 500)
    self.config.interval = 500;

  this.nodeList = {};
  this.nodeListCount = 0;
  this.lights = {};

  this.lifxConfig = {
    debug: false
  };


  /**
   * Check if value is non empty string
   * @param  {*}  x    Value to check
   * @return {boolean} Non empty string
   */
  function isStringVal(x) {
    return typeof x === 'string' && x.length;
  }

  if (isStringVal(self.config.address))
    this.lifxConfig.address = this.config.address;
  if (isStringVal(self.config.broadcast))
    this.lifxConfig.broadcast = this.config.broadcast;
  if (isStringVal(self.config.lights))
    this.lifxConfig.lights = this.config.lights.split(/ *, */g);

  this.lifxClient = new nodeLifx.Client();

  // New lifx detected
  this.lifxClient.on('light-new', (lifxLight) => {
    var light = self.newLight(lifxLight);

    // Need to initialize the light
    light.initialize((err) => {
      if (err) {
        return self.emit('error', err.toString());
      }
      this.lights[light.uniqueid] = light;
    });
  });

  // Offline state detected
  this.lifxClient.on('light-offline', (lightOffline) => {
    let uniqueid = lightOffline.id;
    if (!self.lights.hasOwnProperty(uniqueid))
      return;

    var light = self.lights[uniqueid];
    light.setReachable(false);
  });

  // Online state detected
  this.lifxClient.on('light-online', (lightOnline) => {
    let uniqueid = lightOnline.id;
    if (!self.lights.hasOwnProperty(uniqueid))
      return;

    var light = self.lights[uniqueid];
    light.setReachable(true);
  });
 
  this.lifxClient.init(this.lifxConfig);

  EventEmitter.call(this);
}

inherits(LightServer, EventEmitter);


/**
 * Stop the server
 */
LightServer.prototype.stop = function stop() {
  var self = this;

  if (this.lightPollInterval !== null)
    clearInterval(this.lightPollInterval);
  this.lightPollInterval = null;
  
  Object.keys(this.lights).forEach((uniqueid) => {
    var light = self.lights[uniqueid];
    light.stop();
  });
  this.lights = {};

  this.lifxClient.stopDiscovery();
  this.lifxClient.stopSendingProcess();
  this.lifxClient.destroy();
  this.lifxClient = null;
}


/**
 * Create new light for the server
 * @param {object} info Hue info
 * @return {LightItem} New light
 */
LightServer.prototype.newLight = function newLight(info) {
  var self = this;
  var light = new LightItem(info, this.config);

  light.on('error', (msg, obj) => {
    self.emit('error', msg, obj);
  });

  light.on('warning', (msg, obj) => {
    self.emit('warning', msg, obj);
  });

  light.on('change', () => {
    self.statusUpdateLight(light);
  });

  return light;
}


/**
 * Using light find all connected nodes and update state for them
 * @param  {object} light Lifx light
 */
LightServer.prototype.statusUpdateLight = function statusUpdateLight(light) {
  var self = this;

  if (this.nodeList.hasOwnProperty(light.uniqueid)) {
    let tmp = this.nodeList[light.uniqueid];
    let colors = light.getColors();
    Object.keys(tmp).forEach((nodeID) => {
      var node = self.nodeList[light.uniqueid][nodeID];
      light.updateNodeStatus(node);
      if (node.isOutput)
        node.send(colors);
    });
  }
};


/**
 * Add Node-Red node to the server
 * @param {string} lightID ID/Label of the light
 * @param {string} nodeID  ID for the node
 * @param {object} node    Node-Red object
 */
LightServer.prototype.nodeRegister = function nodeRegister(lightID, nodeID, node) {
  if (!this.nodeList.hasOwnProperty(lightID))
    this.nodeList[lightID] = {};
  this.nodeList[lightID][nodeID] = node;

  // Check if we have this light already
  if (this.lights.hasOwnProperty(lightID)) {
    let light = this.lights[lightID];
    light.updateNodeStatus(node);
    if (node.isOutput)
      node.send(light.getColors());
    return;
  }

  // Light not found (yet), set status to unknown
  node.status({fill:"red",shape:"ring",text:"unknown"});
};


/**
 * Remove Node-Red node from the server
 * @param  {string} lightID ID/Label for the light
 * @param  {string} nodeID  ID for the node
 */
LightServer.prototype.nodeUnregister = function unregisterNode(lightID, nodeID) {

  if (!this.nodeList.hasOwnProperty(lightID))
    return;

  if (!this.nodeList[lightID].hasOwnProperty(nodeID))
    return;
  
  delete this.nodeList[lightID][nodeID];
};


/**
 * Change light state
 * @param  {string} lightID ID/Label for the light
 * @param  {object} value   New values for the light
 */
LightServer.prototype.lightChange = function lightChange(lightID, value) {
  if (!this.lights.hasOwnProperty(lightID))
    return;

  var light = this.lights[lightID];

  // Update light color
  light.setColor(value);
}


/**
 * Retreive list of detected lights
 * @return {array} Array with id, address and label for each light
 */
LightServer.prototype.getLights = function getLights() {
  var self = this;
  var retVal = Object.keys(self.lights).reduce((coll, lightid) => {
    var light = self.lights[lightid];
    var val = { id: light.uniqueid, info: light.info.address, name: light.info.label };
    coll.push(val);
    return coll;
  }, []);

  return retVal;
 }


/**
 * Exports LightServer to Node-Red
 * @param  {object} RED Node-red
 */
module.exports = function(RED) {
  // list of servers
  var lifxServerList = {};

  /**
   * LightServer wrapper for Node-Red
   * @param {object} config Configuration
   */
  function LightServerWrapper(config) {
    var self = this;
    RED.nodes.createNode(self, config);

    self.config = {
      name:     config.name,
      key:      config.key,
      network:  config.network,
      interval: config.interval,
    };

    // Create server
    this.lightServer = new LightServer(config);
  
    // Create wrapper functions
    this.stop           = this.lightServer.stop.bind(this.lightServer);
    
    this.nodeRegister   = this.lightServer.nodeRegister.bind(this.lightServer);
    this.nodeUnregister = this.lightServer.nodeUnregister.bind(this.lightServer);
    
    this.lightChange    = this.lightServer.lightChange.bind(this.lightServer);

    this.getLights      = this.lightServer.getLights.bind(this.lightServer);

    // Handle close event
    self.on('close', () => {
      self.stop();

      delete lifxServerList[self.id];
    });

    // Server errors
    this.lightServer.on('error', (msg, obj) => {
      self.err(msg, obj);
    });

    // Server warnings
    this.lightServer.on('warning', (msg, obj) => {
      self.warn(msg, obj);
    });

    lifxServerList[self.id] = self;
  }

  RED.nodes.registerType("node-lifx-server", LightServerWrapper);

  // Get list of lights
  RED.httpAdmin.get('/node-lifx/lights', function(req, res) {
    if(!req.query.server) {
      res.status(500).send("Missing arguments");
      return;
    }

    // Query server for information
    if (lifxServerList.hasOwnProperty(req.query.server)) {
      var server = lifxServerList[req.query.server];

      res.set({'content-type': 'application/json; charset=utf-8'})
      res.end(JSON.stringify(server.getLights()));
      return;
    }

    res.status(500).send("Server not found or not activated");
    return;
  });

}
