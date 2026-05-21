export interface LogEntry {
  type: 'thought' | 'action' | 'status';
  message: string;
  timestamp: number;
}
