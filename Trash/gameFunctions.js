

async function testFunction() {
    try {
        return "This is a test function"
    } catch (error) {
        return { message: "Error in testFunction", error: error }
    }
}

function getDebugGraphics(blocked_tiles) {
    let allTiles = blocked_tiles.getTilesWithin(0, 0, blocked_tiles.width, blocked_tiles.height);
    let collidingTiles = allTiles.filter(tile => tile.collides);
    let simplifiedCollidingTiles = collidingTiles.map(tile => ({
      index: tile.index,
      pixelX: tile.pixelX,
      pixelY: tile.pixelY,
      width: tile.width,
      height: tile.height
    }));

    return simplifiedCollidingTiles;
  }

  function grabbingPlayer(clicked, socket){
    let charId = clicked._id;
    var grabbedPlayer = '';
    players[socket.id].isHolding = players[clicked.playerId].playerId;
    players[clicked.playerId].heldBy = players[socket.id].playerId;
    grabbedPlayer = players[clicked.playerId];

    console.group('\n\n grabbingPlayer function called: \n');
      console.table([
        {
          'Grabbing Plyr firstName: ': players[socket.id].firstName,
          'Grabbing Plyr lastName: ': players[socket.id].lastName,
          'Grabbing Plyr Mongo._id': players[socket.id]._id,
          'Grabbing Plyr Socket.id': players[socket.id].playerId,
          'Grabbing Plyr Identifier': players[socket.id].Identifier,
          'Grabbing Plyr Held By': players[socket.id].heldBy,
          'Grabbing Plyr is Holding': players[socket.id].isHolding,
          'Grabbing Plyr X': players[socket.id].position.x,
          'Grabbing Plyr Y': players[socket.id].position.y
        }
      ]);

      log('\n');

      console.table([
        {
          'Grabbed Plyr firstName: ': grabbedPlayer.firstName,
          'Grabbed Plyr lastName: ': grabbedPlayer.lastName,
          'Grabbed Plyr Mongo._id': grabbedPlayer._id,
          'Grabbed Plyr Socket.id': grabbedPlayer.playerId,
          'Grabbed Plyr Identifier': grabbedPlayer.Identifier,
          'Grabbed Plyr Held By': grabbedPlayer.heldBy,
          'Grabbed Plyr is Holding': grabbedPlayer.isHolding,
          'Grabbed Plyr X': grabbedPlayer.position.x,
          'Grabbed Plyr Y': grabbedPlayer.position.y
        }
      ]);
    console.groupEnd();

    // log('self.players[clicked.playerId] = ', self.players[clicked.playerId]);
    // log('self.players = ', self.players);
    // log('grabber clicked = ', clicked);
    // log('grabber socket = ', socket);
    // var grabber = '';
    // var grabbed = '';
    // self.players.getChildren().forEach((player) => {
    //   log('grab function looping through players');
    //   if (player.playerId == clicked.playerId) {
    //     log('grab function found grab target player');
    //     log('grabbed ID = ', player.playerId);
    //     // log('grabbed player = ', player);
    //     grabbed = player;
    //   }
    //   if (player.playerId == socket.id) {
    //     log('grab function found grabbing player');
    //     log('grabber ID = ', player.playerId)
    //     // log('grabber player = ', player);
    //     grabber = player;
    //   }
    // })
    // if (grabber && grabbed){
    //   log('Both Grabber and Grabbed are found');
    //   log('grabber = ', grabber.playerId);
    //   log('grabbed = ', grabbed.playerId);

    //   log('grabber X = ', grabber.position.x, 'grabber Y = ', grabber.position.y);

    //   // self.add.follower(grabbed);
    //   // grabbed.startFollow(grabber);
    // }
    // self.players[clicked.playerId].startFollow(self.players[socket.id]);

    socket.emit('grabbedInfo', grabbedPlayer);
  }


module.exports = {
testFunction, 
getDebugGraphics
}