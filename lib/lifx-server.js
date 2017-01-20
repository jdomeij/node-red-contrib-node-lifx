"use strict";

var nodeLifx   = require('node-lifx');
//var nodeLifx   = require('./node-lifx-emulator.js')
var _          = require('lodash');
var LightItem  = require('./lifx-light.js');

var inherits      = require('util').inherits;
var EventEmitter  = require('events').EventEmitter;


/**
 * Create unique id from Lifx info
 * @param  {object}  lifxInfo Lifx info
 * @return {string} ID
 */
function createLightID(lifxInfo) {
  return lifxInfo.id;
}


/**
 * Create new light server
 * @param {object} config Configuraion
 */
function LightServer(config) {
  var self = this;

  self.config = _.merge({}, config);

  // Convert from string
  if (typeof self.config.interval === 'string')
    self.config.interval = parseInt(self.config.interval, 10);
  
  // Ensure that we don't use to low poll interval
  if (typeof self.config.interval !== 'number' || isNaN(self.config.interval) || self.interval < 500)
    self.config.interval = 500;

  this.nodeList = {};
  this.nodeListCount = 0;

  // List of all lights
  this.lights = {};

  // Node-Lifx configuration
  this.lifxConfig = {
    debug: false
  };

  // Populate Node-Lifx configuration
  if (_.isString(self.config.address) && self.config.address.length)
    this.lifxConfig.address = this.config.address;
  if (_.isString(self.config.broadcast) && self.config.broadcast.length)
    this.lifxConfig.broadcast = this.config.broadcast;
  if (_.isString(self.config.lights) && self.config.lights)
    this.lifxConfig.lights = this.config.lights.split(/ *, */g);

  // Create new API
  this.lifxClient = new nodeLifx.Client();

  // New lifx detected
  this.lifxClient.on('light-new', (lifxLight) => {
    // Ensure that we don't have multiple lights with the same id
    let lightID = createLightID(lifxLight);
    if (self.lights.hasOwnProperty(lightID))
      return;

    // Create the new light
    self.newLight(lightID, lifxLight, (err) => {
      if (err) {
        return self.emit('error', err.toString());
      }
    });
  });

  // Offline state detected
  this.lifxClient.on('light-offline', (lightOffline) => {
    let lightID = createLightID(lightOffline)
    if (!self.lights.hasOwnProperty(lightID))
      return;

    var light = self.lights[lightID];
    light.setReachable(false);
  });

  // Online state detected
  this.lifxClient.on('light-online', (lightOnline) => {
    let lightID = createLightID(lightOnline);
    if (!self.lights.hasOwnProperty(lightID))
      return;

    var light = self.lights[lightID];
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

  Object.keys(this.lights).forEach((lightID) => {
    var light = self.lights[lightID];
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
 * @param {string}  lightID  ID for light/group
 * @param {object}  lifxInfo Lifx info
 * @param {function} callback Result callback
 */
LightServer.prototype.newLight = function newLight(lightID, lifxInfo, callback) {
  var self = this;
  var light = new LightItem(lightID, lifxInfo, this.config);

  light.initialize((err) => {
    if (err)
      return callback(err);

    light.on('error', (msg, obj) => {
      self.emit('error', msg, obj);
    });

    light.on('warning', (msg, obj) => {
      self.emit('warning', msg, obj);
    });

    light.on('change', () => {
      self.statusUpdateLight(lightID, light, 'change');
    });

    light.on('updated', () => {
      self.statusUpdateLight(lightID, light, 'updated');
    })

    // Attach the light
    self.lights[lightID] = light;

    // Because we only attach the change event after the light is initialized we need to
    // manually trigger status update
    self.statusUpdateLight(lightID, light, 'new');

    callback(null, light);
  });
}


/**
 * Using light find all connected nodes and update state for them
 * @param {string} lightID  ID for light/group
 * @param {object} light    Lifx light
 * @param {string} event    Event triggering this update
 */
LightServer.prototype.statusUpdateLight = function statusUpdateLight(lightID, light, event) {
  var self = this;

  if (this.nodeList.hasOwnProperty(lightID)) {
    let tmp = this.nodeList[lightID];
    let message;

    Object.keys(tmp).forEach((nodeID) => {
      var node = self.nodeList[lightID][nodeID];
      light.updateNodeStatus(node);
      
      // Ouput node
      if (node.isOutput) {

        // Only generate message if needed
        if (message === undefined) {
          message = light.getStateMessage();
          message.event = event;
        }

        node.send(message);
      }
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
    if (node.isOutput) {
      // Get message and set event as new
      let message = light.getStateMessage();
      message.event = 'new';
      node.send(message);
    }
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
  var retVal = Object.keys(self.lights).reduce((coll, lightID) => {
    var light = self.lights[lightID];
    var val = { id: lightID, info: light.info.address, name: light.info.label };
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
