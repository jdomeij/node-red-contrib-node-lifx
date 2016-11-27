var lifxServer = require('./lifx-server.js');

module.exports = function(RED) {
  "use strict";

  // The main node definition - most things happen in here
  function LifxNode(n) {
    var node = this;
    var debug = !!n.debug;

    this.isOutput = true;

    // Create a RED node
    RED.nodes.createNode(this, n);

    node.lightID = n.lightID;
    lifxServer.addNode(node.lightID, node.id, node);

    node.state = {
      lightID: n.lightID,
    };

    node.on('close', function() {
      lifxServer.removeNode(node.lightID, node.id);
    });
  }

  RED.nodes.registerType('node-lifx-out', LifxNode);
};
