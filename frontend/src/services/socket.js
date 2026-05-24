import { io } from 'socket.io-client';
const BASE = process.env.REACT_APP_API_URL || 'http://localhost:4000';
const socket = io(BASE, { transports: ['websocket', 'polling'], autoConnect: true });
export default socket;
