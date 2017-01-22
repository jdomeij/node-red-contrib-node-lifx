"use strict";

var LightServer  = require('../lib/lifx-server.js');

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
    this.getLightHandler = this.lightServer.getLightHandler.bind(this.lightServer);
    this.getLights       = this.lightServer.getLights.bind(this.lightServer);

    // Handle close event
    self.on('close', () => {
      self.lightServer.stop();

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
