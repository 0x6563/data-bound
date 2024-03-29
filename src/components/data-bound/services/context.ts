import { JSONPath } from 'jsonpath-plus';
import type { DataBoundApplication } from './application';
import { Bindable, Hideable, Lockable } from './types';

export class Context {
    private bind?: string;
    private hide?: string | boolean;
    private lock?: string | boolean;
    private scopes: { [key: string]: Context };
    private $data: any;
    private children: Set<Context> = new Set();
    private meta: { [key: string]: any } = {};
    private $state = { lock: false, hide: false };

    private $events = new EventTarget();

    get state() {
        return { ...this.$state }
    }

    get data() {
        return this.resolve(this.bind).value;
    }

    set data(value: any) {
        const { parent, parentProperty } = this.resolve(this.bind);
        if (parentProperty) {
            parent[parentProperty] = value;
        }
    }

    application: DataBoundApplication;
    private dataListener = () => this.$events.dispatchEvent(new CustomEvent('data'));
    constructor({ data, scopes, bind, lock, hide, application, meta }: ContextConfig) {
        this.bind = bind;
        this.lock = lock;
        this.hide = hide;
        this.$data = data;
        this.scopes = { ...scopes, root: scopes?.root || this, relative: scopes?.relative || this }
        this.application = application;
        if (meta) {
            this.meta = meta;
        } else {
            this.meta.bind = this.bind;
        }
        this.reval();
        this.addEventListener('data', () => this.reval());
        this.application.observer.watch(this.$data, this.dataListener)
    }

    onDestroy() {
        this.application.observer.unwatch(this.$data, this.dataListener)
    }

    addEventListener(type: 'data' | 'state', callback: (detail: any) => void) {
        this.$events.addEventListener(type, ((e: CustomEvent<string[]>) => { callback(e.detail) }) as any);

    }
    removeEventListener(type: 'data' | 'state', callback: () => void) {
        this.$events.removeEventListener(type, callback);
    }
    reval() {
        const changes: string[] = [];
        const hide = this.application.test(this.data, this.hide);
        const lock = this.application.test(this.data, this.lock);
        if (hide != this.$state.hide) {
            changes.push('hide');
            this.$state.hide = hide;
        }
        if (lock != this.$state.lock) {
            changes.push('lock');
            this.$state.lock = lock;
        }
        if (changes.length) {
            this.$events.dispatchEvent(new CustomEvent('state', { detail: changes }))
        }
    }

    fork({ bind, hide, lock }: Bindable & Lockable & Hideable) {
        const relative = this.findNearestBoundContext();
        const config = PathResolver.IsMetaPath(bind) ? { data: this.$data, meta: relative.meta } : { data: this.data };
        const context = new Context({
            ...config,
            scopes: {
                ...this.scopes,
                parent: this,
                relative
            },
            bind,
            hide,
            lock,
            application: this.application
        });
        this.children.add(context);
        return context;
    }

    disconnect() {
        this.scopes.parent?.children.delete(this);
    }

    private findNearestBoundContext(): Context {
        if (this.bind) {
            return this;
        } else if (this.scopes.relative?.bind) {
            return this.scopes.relative
        } else if (this.scopes?.relative?.scopes?.relative) {
            return this.scopes.relative.scopes.relative
        } else {
            return this;
        }
    }

    private resolve(path: string = '$'): Result {
        if (PathResolver.IsScopePath(path))
            return this.scopes[path.slice(1, path.indexOf('.'))].resolve(path.slice(path.indexOf('.') + 1));

        if (PathResolver.IsMetaPath(path)) {
            return PathResolver.Resolve(this.meta, path.slice(1));
        }
        return PathResolver.Resolve(this.$data, path);
    }

}

class PathResolver {

    static IsScopePath(path: string = '$') {
        return /^\$[a-z\d]+/i.test(path);
    }

    static IsMetaPath(path: string = '$') {
        return (/^@[a-z\d]+/i.test(path));
    }

    static Resolve(json: any, path: string, resultType: 'value' | 'path' | 'pointer' | 'parent' | 'parentProperty' | 'all' = 'all') {
        return JSONPath({ path, json, resultType, wrap: false });
    }
}


export interface ContextConfig extends Hideable, Lockable, Bindable {
    data: any;
    scopes?: {
        [key: string]: Context;
    }
    meta?: {
        [key: string]: any
    }
    application: DataBoundApplication;
}

export interface Result {
    "value": any;
    "path": string;
    "pointer": string;
    "parentProperty"?: string;
    "parent"?: any;
}