function initSocket(io) {
  io.on('connection', (socket) => {
    // Each client identifies itself so we can target requests/notifications precisely.
    socket.on('identify', ({ role, id }) => {
      if (!role || !id) return;
      socket.join(`${role}:${id}`);
    });

    // Join the shared video-call room for a specific consultation.
    // Acknowledges back how many peers were already in the room *before* this
    // join, so the joining client can know immediately whether it's the first
    // or second one there (used to decide who creates the WebRTC offer, and when).
    socket.on('room:join', ({ roomId }, ack) => {
      if (!roomId) return;
      const room = io.sockets.adapter.rooms.get(`room:${roomId}`);
      const priorCount = room ? room.size : 0;
      socket.join(`room:${roomId}`);
      socket.to(`room:${roomId}`).emit('room:peer-joined');
      if (typeof ack === 'function') ack({ priorCount });
    });

    socket.on('room:leave', ({ roomId }) => {
      if (!roomId) return;
      socket.leave(`room:${roomId}`);
      socket.to(`room:${roomId}`).emit('room:peer-left');
    });

    // ---- WebRTC signaling relay (offer / answer / ICE candidates) ----
    socket.on('webrtc:offer', ({ roomId, offer }) => {
      socket.to(`room:${roomId}`).emit('webrtc:offer', { offer });
    });
    socket.on('webrtc:answer', ({ roomId, answer }) => {
      socket.to(`room:${roomId}`).emit('webrtc:answer', { answer });
    });
    socket.on('webrtc:ice-candidate', ({ roomId, candidate }) => {
      socket.to(`room:${roomId}`).emit('webrtc:ice-candidate', { candidate });
    });

    socket.on('call:hangup', ({ roomId }) => {
      socket.to(`room:${roomId}`).emit('call:hangup');
    });
  });
}

module.exports = { initSocket };
