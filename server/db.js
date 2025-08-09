"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.pool = void 0;
const serverless_1 = require("@neondatabase/serverless");
const neon_serverless_1 = require("drizzle-orm/neon-serverless");
const ws_1 = __importDefault(require("ws"));
const schema = __importStar(require("@shared/schema"));
// Configure WebSocket for Neon in Node.js environment
serverless_1.neonConfig.webSocketConstructor = ws_1.default;
// Configure Neon for better reliability
serverless_1.neonConfig.pipelineConnect = false;
serverless_1.neonConfig.pipelineTLS = false;
if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}
exports.pool = new serverless_1.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 30000, // 30 second timeout for high load
    idleTimeoutMillis: 300000, // 5 minute idle timeout
    max: 20, // Reduced for better memory management
    maxUses: 7500, // Higher reuse for sustained performance
    allowExitOnIdle: true // Allow graceful shutdown
});
// Add error handling for the pool
exports.pool.on('error', (err) => {
    console.error('Database pool error:', err);
});
exports.pool.on('connect', () => {
    console.log('Database pool connected');
});
// Test connection on module load
console.log('Database module loaded, testing basic connection...');
exports.db = (0, neon_serverless_1.drizzle)({ client: exports.pool, schema });
