import fs from 'fs';
import path from 'path';
import mkdirp from 'mkdirp';
import { Tape } from './tape';
import { Context } from './options';
import { Request } from './http/http';
import TapeFile from './tape-file';

export default class TapeStore {
  public tapeFiles: { [pathname: string]: TapeFile };
  private context: Context;
  private path?: string;

  constructor(options: Context) {
    this.path = options.tapesPath && path.normalize(`${options.tapesPath}/`);
    this.context = options;
    this.tapeFiles = {};
    this.load();
  }

  load() {
    if (this.path) {
      mkdirp.sync(this.path);
      this.loadTapesAtDir(this.path);
    }
    this.context.logger.log(`Loaded ${this.tapeFiles.length} tapes`);
  }

  loadTapesAtDir(directory: string) {
    const items = fs.readdirSync(directory);

    for (const filename of items) {
      const fullPath = `${directory}${filename}`;
      const stat = fs.statSync(fullPath);

      if (!stat.isDirectory()) {
        try {
          const tapeFile = new TapeFile(fullPath, this.context);

          this.tapeFiles[tapeFile.name] = tapeFile;
        } catch (e) {
          this.context.logger.error(`Error reading tape ${fullPath}\n${e.toString()}`);
        }
      } else {
        this.loadTapesAtDir(`${fullPath}/`);
      }
    }
  }

  getAllTapes(): Tape[] {
    return Object.values(this.tapeFiles).reduce(
      (tapes, tapeFile) => [...tapes, ...tapeFile.getAllTapes()],
      [] as Tape[],
    );
  }

  find(request: Request): Tape | null {
    const tapeFile = this.tapeFiles[request.url.pathname];

    return tapeFile ? tapeFile.find(request) : null;
  }

  private findTapeFile(tape: Tape): TapeFile | null {
    return this.tapeFiles[tape.request.url.pathname];
  }

  save(tape: Tape) {
    tape.meta.new = true;
    tape.meta.used = true;

    const tapePath = tape.meta.path || this.createTapePath(tape);

    let tapeFile = this.findTapeFile(tape);

    if (tapeFile) {
      tapeFile.add(tape);
    } else {
      tapeFile = new TapeFile(tapePath, this.context);
      tapeFile.add(tape);
      this.tapeFiles[tape.request.url.pathname] = tapeFile;
    }

    this.context.logger.log(`Saving request ${tape.request.url} at ${tape.meta.path}`);
  }

  createTapeName(tape: Tape) {
    const ext = this.context.tapeExtension;

    if (this.context.tapeNameGenerator) {
      const tapeName = this.context.tapeNameGenerator(tape);

      if (!tapeName.endsWith(`.${ext}`)) {
        return `${tapeName}.${ext}`;
      }

      return tapeName;
    }

    const url = tape.request.url;

    const tapeName = url.pathname.replace(/\//g, '.');

    return `${tapeName}.${ext}`;
  }

  createTapePath(tape: Tape) {
    const tapeName = this.createTapeName(tape);

    let result;

    if (this.context.tapePathGenerator) {
      result = this.context.tapePathGenerator(tape.request);
    }

    if (!result && this.context.tapesPath) {
      result = this.context.tapesPath;
    }

    if (!result) {
      throw new Error(`Cant create path for tape ${tape.request.url}`);
    }

    result = path.normalize(path.join(result, tapeName));

    const dir = path.dirname(result);

    mkdirp.sync(dir);

    return result;
  }

  hasPath(pathToCheck: string) {
    return this.path === path.normalize(`${pathToCheck}/`);
  }
}
