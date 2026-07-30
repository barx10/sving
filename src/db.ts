import Dexie, { type Table } from 'dexie';
import type { SavedTour } from './types';

export class SvingyDatabase extends Dexie {
  tours!: Table<SavedTour, string>;

  constructor() {
    super('SvingyMCDatabase');
    this.version(1).stores({
      tours: 'id, title, createdAt, distanceKm, profile',
    });
  }
}

export const db = new SvingyDatabase();
