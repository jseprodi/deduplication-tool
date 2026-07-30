import type { ManagementClient } from "./clients";
import type { ElementKind } from "../types";

export interface ElementInfo {
  codename: string;
  kind: ElementKind;
}

export interface TypeSchema {
  codename: string;
  elementsById: Map<string, ElementInfo>;
}

/**
 * Language variant elements only carry an element `id` (no codename/type) — the
 * Management API doesn't echo that back. To know whether a given element is
 * modular_content, rich_text, or something else we don't touch, we resolve it
 * against the owning content type's schema, cached per type since many
 * referencing items usually share a handful of types.
 */
export class ContentTypeCache {
  private byCodename = new Map<string, TypeSchema>();
  private idToCodename = new Map<string, string>();
  private pending = new Map<string, Promise<TypeSchema>>();
  private mapi: ManagementClient;

  constructor(mapi: ManagementClient) {
    this.mapi = mapi;
  }

  async getByCodename(typeCodename: string): Promise<TypeSchema> {
    const cached = this.byCodename.get(typeCodename);
    if (cached) return cached;
    const inFlight = this.pending.get(`c:${typeCodename}`);
    if (inFlight) return inFlight;

    const promise = this.mapi
      .viewContentType()
      .byTypeCodename(typeCodename)
      .toPromise()
      .then((response) => this.store(response.data));
    this.pending.set(`c:${typeCodename}`, promise);
    return promise;
  }

  async getById(typeId: string): Promise<TypeSchema> {
    const codename = this.idToCodename.get(typeId);
    if (codename) return this.getByCodename(codename);
    const inFlight = this.pending.get(`i:${typeId}`);
    if (inFlight) return inFlight;

    const promise = this.mapi
      .viewContentType()
      .byTypeId(typeId)
      .toPromise()
      .then((response) => this.store(response.data));
    this.pending.set(`i:${typeId}`, promise);
    return promise;
  }

  private store(data: { id: string; codename: string; elements: unknown[] }): TypeSchema {
    const elementsById = new Map<string, ElementInfo>();
    for (const el of data.elements) {
      const rawType = (el as { type?: string }).type;
      const id = (el as { id?: string }).id;
      const codename = (el as { codename?: string }).codename;
      if (!id || !codename) continue;
      const kind: ElementKind =
        rawType === "modular_content"
          ? "modular_content"
          : rawType === "rich_text"
            ? "rich_text"
            : rawType === "url_slug"
              ? "url_slug"
              : "other";
      elementsById.set(id, { codename, kind });
    }
    const schema: TypeSchema = { codename: data.codename, elementsById };
    this.byCodename.set(data.codename, schema);
    this.idToCodename.set(data.id, data.codename);
    return schema;
  }
}
