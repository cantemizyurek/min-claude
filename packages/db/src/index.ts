export { createDb } from "./client";
export type { Db } from "./client";
export { projects, prds, messages, prdPhases, messageRoles } from "./schema";
export type { PrdPhase, MessageRole } from "./schema";
export {
  getAllProjects,
  getProjectById,
  createProject,
  deleteProject,
  getPrdsByProjectId,
  getPrdById,
  createPrd,
  updatePrdPhase,
  updatePrdSessionId,
  updatePrdGithubIssueNumber,
  getMessagesByPrdId,
  getMessagesByPrdIdAfter,
  createMessage,
} from "./queries";
