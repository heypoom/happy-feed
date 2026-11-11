// Where the feed keeps its records, caches and published files: R2 in the Worker and from the laptop,
// memory in tests. Values are JSON.
export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  list(prefix: string): Promise<StoredObject[]>;
  delete(key: string): Promise<void>;
}

export type StoredObject = { key: string; uploaded: Date };

export class MemoryStore implements Store {
  readonly objects = new Map<string, { body: string; uploaded: Date }>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async get<T>(key: string): Promise<T | undefined> {
    const object = this.objects.get(key);
    return object ? (JSON.parse(object.body) as T) : undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.objects.set(key, { body: JSON.stringify(value), uploaded: this.clock() });
  }

  async list(prefix: string): Promise<StoredObject[]> {
    return [...this.objects]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, { uploaded }]) => ({ key, uploaded }));
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
