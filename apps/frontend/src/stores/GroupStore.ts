import { makeAutoObservable, runInAction } from 'mobx';

import {
  addGroupMember,
  createGroup,
  deleteGroup as deleteGroupApi,
  fetchGroups,
  updateGroupMembers,
  type VesselGroup,
} from '../data_loaders/groups';

/** Vessel groups (create / list / add members). */
export class GroupStore {
  groups: VesselGroup[] = [];
  loaded = false;

  constructor() {
    makeAutoObservable(this);
  }

  async loadGroups(): Promise<void> {
    try {
      const groups = await fetchGroups();
      runInAction(() => {
        this.groups = groups;
        this.loaded = true;
      });
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  }

  async createGroup(name: string, mmsi?: string): Promise<void> {
    try {
      await createGroup(name, mmsi);
      await this.loadGroups();
    } catch (error) {
      console.error('Failed to create group:', error);
    }
  }

  async addMember(groupId: number, mmsi: string): Promise<void> {
    try {
      await addGroupMember(groupId, mmsi);
      await this.loadGroups();
    } catch (error) {
      console.error('Failed to add vessel to group:', error);
    }
  }

  async updateMembers(groupId: number, mmsis: string[], name?: string): Promise<void> {
    try {
      await updateGroupMembers(groupId, mmsis, name);
      await this.loadGroups();
    } catch (error) {
      console.error('Failed to update group:', error);
    }
  }

  async deleteGroup(groupId: number): Promise<void> {
    try {
      await deleteGroupApi(groupId);
      await this.loadGroups();
    } catch (error) {
      console.error('Failed to delete group:', error);
    }
  }
}
