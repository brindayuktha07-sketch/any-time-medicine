require('dotenv').config();

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const { connectMongo } = require('./src/mongo');
const { seedIfEmpty } = require('./src/seed');

const authRoutes = require('./src/routes/auth');
const patientRoutes = require('./src/routes/patient');
const doctorRoutes = require('./src/routes/doctor');
const adminRoutes = require('./src/routes/admin');
const medicineRoutes = require('./src/routes/medicines');
const { router: consultationRoutes, attachIo } = require('./src/routes/consultation');
const { initSocket } = require('./src/socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/consultations', consultationRoutes);

attachIo(io);
initSocket(io);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

async function start() {
  await connectMongo();
  await seedIfEmpty();
  server.listen(PORT, () => {
    console.log(`\n  ATM - Any Time Medicine running at http://localhost:${PORT}\n`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
