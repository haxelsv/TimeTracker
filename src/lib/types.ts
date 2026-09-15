export type Role = 'admin' | 'member';
export interface Workspace {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  project_status_policy: 'all' | 'admins';
}
export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}
export interface Client {
  id: string;
  name: string;
  email: string;
  archived: boolean;
  logo_url: string | null;
}
export interface Project {
  id: string;
  name: string;
  client_id: string | null;
  color: string;
  estimate: number;
  archived: boolean;
  member_ids: string[];
  status: WorkStatus;
  completed_at: string | null;
}
export type WorkStatus = 'pending' | 'in_progress' | 'completed';
export interface Task {
  id: string;
  project_id: string;
  name: string;
  estimate: number;
  archived: boolean;
  assignee_ids: string[];
  status: WorkStatus;
  completed_at: string | null;
}
export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  project_id: string | null;
  task_id: string | null;
  read_at: string | null;
  created_at: string;
}
export interface Tag {
  id: string;
  name: string;
}
export interface Entry {
  id: string;
  user_id: string;
  description: string;
  project_id: string | null;
  task_id: string | null;
  tag_ids: string[];
  billable: boolean;
  start_at: string;
  end_at: string | null;
  rate?: number;
  currency?: string;
}
export interface Approval {
  id: string;
  user_id: string;
  week: string;
  status: 'submitted' | 'approved' | 'returned';
  comment: string;
  updated_at: string;
}
export interface Rate {
  id: string;
  user_id: string | null;
  project_id: string | null;
  amount: number;
}
export interface Audit {
  id: string;
  actor_id: string;
  action: string;
  detail: string;
  created_at: string;
}
export interface Invitation {
  id: string;
  email: string;
  role: Role;
  expires_at: string;
  accepted: boolean;
  status?: 'pending' | 'accepted' | 'expired' | 'cancelled';
  sent_at?: string | null;
  last_sent_at?: string | null;
  send_count?: number;
  created_at?: string;
}
export interface Snapshot {
  workspace: Workspace;
  me: Member;
  members: Member[];
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  tags: Tag[];
  entries: Entry[];
  approvals: Approval[];
  rates: Rate[];
  audit: Audit[];
  invitations: Invitation[];
  notifications: Notification[];
  server_now: string;
}
export type Payload = Record<string, unknown>;
