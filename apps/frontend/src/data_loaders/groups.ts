export interface VesselGroup {
  id: number;
  name: string;
  mmsis: string[];
}

export async function fetchGroups(): Promise<VesselGroup[]> {
  const response = await fetch('/api/groups');
  if (!response.ok) {
    throw new Error(`Failed to fetch groups: ${response.status}`);
  }
  return (await response.json()) as VesselGroup[];
}

/** Create a group, optionally seeded with one vessel. */
export async function createGroup(name: string, mmsi?: string): Promise<VesselGroup> {
  const response = await fetch('/api/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mmsi }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create group: ${response.status}`);
  }
  return (await response.json()) as VesselGroup;
}

/** Add a vessel to an existing group. */
export async function addGroupMember(groupId: number, mmsi: string): Promise<VesselGroup> {
  const response = await fetch(`/api/groups/${groupId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mmsi }),
  });
  if (!response.ok) {
    throw new Error(`Failed to add to group: ${response.status}`);
  }
  return (await response.json()) as VesselGroup;
}

/** Replace a group's member list and (optionally) rename it. */
export async function updateGroupMembers(
  groupId: number,
  mmsis: string[],
  name?: string,
): Promise<VesselGroup> {
  const response = await fetch(`/api/groups/${groupId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(name === undefined ? { mmsis } : { mmsis, name }),
  });
  if (!response.ok) {
    throw new Error(`Failed to update group: ${response.status}`);
  }
  return (await response.json()) as VesselGroup;
}

/** Delete a group. */
export async function deleteGroup(groupId: number): Promise<void> {
  const response = await fetch(`/api/groups/${groupId}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`Failed to delete group: ${response.status}`);
  }
}
