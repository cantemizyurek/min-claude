export interface Project {
  id: number;
  name: string;
  path: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectInput {
  name: string;
  path: string;
}
