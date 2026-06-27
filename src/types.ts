export type ServiceStatus = "starting" | "running" | "stale" | "stopped";
export type ServiceHealth = "ok" | "fail" | "unknown" | null;
export type PortDetectionMethod = "stdout" | "process_scan" | "unknown";

export interface ListeningPort {
  port: number;
  pid: number;
  command: string | null;
  user: string | null;
  cwd?: string | null;
  projectPath?: string | null;
  projectName?: string | null;
}

export interface Annotation {
  id: string;
  status?: ServiceStatus | null;
  projectPath?: string | null;
  command?: string | null;
  port?: number | null;
  url?: string | null;
  pid?: number | null;
  source?: string | null;
  note?: string | null;
  branch?: string | null;
  kept?: boolean;
  health?: ServiceHealth;
  startedAt?: string | null;
  lastSeenAt?: string | null;
}

export interface Service {
  id: string | null;
  status: ServiceStatus;
  projectPath: string | null;
  projectName: string | null;
  command: string | null;
  port: number | null;
  url: string | null;
  pid: number | null;
  source: string;
  note: string | null;
  branch: string | null;
  kept: boolean;
  health: ServiceHealth;
  duplicateOf: string | null;
  startedAt: string | null;
  lastSeenAt: string | null;
}

export type PortStatusState =
  | "managed_running"
  | "unmanaged_running"
  | "not_listening_with_record"
  | "free";

export interface PortStatus {
  port: number;
  state: PortStatusState;
  listener: ListeningPort | null;
  service: Service | null;
  recentRecords: Service[];
  suggestedActions: string[];
}

export interface RunCommand {
  (command: string, args: string[]): Promise<string>;
}

interface BaseEvent {
  serviceId: string;
  at: string;
}

export interface ServiceStartedEvent extends BaseEvent {
  type: "service_started";
  projectPath: string;
  command: string;
  pid: number;
  source: string;
  note?: string | null;
  branch?: string | null;
  parentChain: string[];
}

export interface ServiceRegisteredEvent extends BaseEvent {
  type: "service_registered";
  projectPath: string;
  command: string;
  source: string;
  note?: string | null;
  branch?: string | null;
  parentChain: string[];
}

export interface PortDetectedEvent extends BaseEvent {
  type: "port_detected";
  port: number | null;
  url: string | null;
  method: PortDetectionMethod;
}

export interface ServiceReusedEvent extends BaseEvent {
  type: "service_reused";
  requestedBy: string;
  reason: string[];
}

export interface ServiceStoppedEvent extends BaseEvent {
  type: "service_stopped";
  pid: number;
  exitCode: number | null;
  signal: string | null;
}

export interface ServiceAdoptedEvent extends BaseEvent {
  type: "service_adopted";
  projectPath: string | null;
  command: string | null;
  pid: number;
  port: number;
  url: string;
  source: string;
  note: string | null;
  branch: string | null;
  kept: boolean;
  parentChain: string[];
}

export type Event =
  | ServiceStartedEvent
  | ServiceRegisteredEvent
  | PortDetectedEvent
  | ServiceReusedEvent
  | ServiceStoppedEvent
  | ServiceAdoptedEvent;
