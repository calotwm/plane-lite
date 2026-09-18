export interface ListT {
  id: string;
  name: string;
  position: number;
}

export interface CardT {
  id: string;
  title: string;
  description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  listId: string | null;
  position: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  version: number;
}

export interface MemberOption {
  id: string;
  name: string;
}
