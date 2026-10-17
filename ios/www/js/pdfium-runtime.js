// PDFium WebAssembly runtime.
// Adapted from pdfrx (https://github.com/espresso3389/pdfrx), MIT License, Copyright (c) 2018 Takashi Kawasaki.
// PDFium itself is BSD-licensed (Google/Foxit).
'use strict';
/**
 * PDFium WASM module imports
 */
const Pdfium = {
  /**
   * @param {WebAssembly.Exports} wasmExports
   */
  initWith: function (wasmExports) {
    Pdfium.wasmExports = wasmExports;
    Pdfium.memory = Pdfium.wasmExports.memory;
    Pdfium.wasmTable = Pdfium.wasmExports['__indirect_function_table'];
    Pdfium.stackSave = Pdfium.wasmExports['emscripten_stack_get_current'];
    Pdfium.stackRestore = Pdfium.wasmExports['_emscripten_stack_restore'];
    Pdfium.setThrew = Pdfium.wasmExports['setThrew'];
    Pdfium.__emscripten_stack_alloc = wasmExports['_emscripten_stack_alloc'];
  },

  /**
   * @type {WebAssembly.Exports}
   */
  wasmExports: null,
  /**
   * @type {WebAssembly.Memory}
   */
  memory: null,
  /**
   * @type {WebAssembly.Table}
   */
  wasmTable: null,
  /**
   * @type {WebAssembly.Table}
   */
  wasmTableMirror: [],
  /**
   * @type {WeakMap<Function, number>}
   */
  functionsInTableMap: null,
  /**
   * @type {number[]}
   */
  freeTableIndexes: [],
  /**
   * @type {function():number}
   */
  stackSave: null,
  /**
   * @type {function(number):void}
   */
  stackRestore: null,
  /**
   * @type {function(number, number):void}
   */
  setThrew: null,
  /**
   * @type {function(number):number}
   */
  __emscripten_stack_alloc: null,

  /**
   * Invoke a function from the WASM table
   * @param {number} index Function index
   * @param {function(function())} func Function to call
   * @returns {*} Result of the function
   */
  invokeFunc: function (index, func) {
    const sp = Pdfium.stackSave();
    try {
      return func(Pdfium.wasmTable.get(index));
    } catch (e) {
      Pdfium.stackRestore(sp);
      if (e !== e + 0) throw e;
      Pdfium.setThrew(1, 0);
    }
  },

  getCFunc: (ident) => Pdfium.wasmExports['_' + ident],
  writeArrayToMemory: (array, buffer) => HEAP8.set(array, buffer),
  stackAlloc: (sz) => Pdfium.__emscripten_stack_alloc(sz),
  stringToUTF8OnStack: (str) => {
    const size = StringUtils.lengthBytesUTF8(str) + 1;
    const ret = Pdfium.stackAlloc(size);
    StringUtils.stringToUtf8Bytes(str, ret);
    return ret;
  },
  ccall: (ident, returnType, argTypes, args, opts) => {
    const toC = {
      string: (str) => {
        let ret = 0;
        if (str !== null && str !== undefined && str !== 0) {
          ret = Pdfium.stringToUTF8OnStack(str);
        }
        return ret;
      },
      array: (arr) => {
        const ret = Pdfium.stackAlloc(arr.length);
        Pdfium.writeArrayToMemory(arr, ret);
        return ret;
      },
    };
    function convertReturnValue(ret) {
      if (returnType === 'string') return UTF8ToString(ret);
      if (returnType === 'boolean') return Boolean(ret);
      return ret;
    }
    const func = Pdfium.getCFunc(ident);
    const cArgs = [];
    let stack = 0;
    if (args) {
      for (let i = 0; i < args.length; i++) {
        const converter = toC[argTypes[i]];
        if (converter) {
          if (stack === 0) stack = Pdfium.stackSave();
          cArgs[i] = converter(args[i]);
        } else {
          cArgs[i] = args[i];
        }
      }
    }
    let ret = func(...cArgs);
    function onDone(ret) {
      if (stack !== 0) Pdfium.stackRestore(stack);
      return convertReturnValue(ret);
    }
    ret = onDone(ret);
    return ret;
  },
  cwrap: (ident, returnType, argTypes, opts) => {
    const numericArgs = !argTypes || argTypes.every((type) => type === 'number' || type === 'boolean');
    const numericRet = returnType !== 'string';
    if (numericRet && numericArgs && !opts) {
      return Pdfium.getCFunc(ident);
    }
    return (...args) => Pdfium.ccall(ident, returnType, argTypes, args, opts);
  },
  uleb128Encode: (n, target) => {
    if (n < 128) {
      target.push(n);
    } else {
      target.push(n % 128 | 128, n >> 7);
    }
  },
  sigToWasmTypes: (sig) => {
    const typeNames = {
      i: 'i32',
      j: 'i64',
      f: 'f32',
      d: 'f64',
      e: 'externref',
      p: 'i32',
    };
    const type = {
      parameters: [],
      results: sig[0] == 'v' ? [] : [typeNames[sig[0]]],
    };
    for (let i = 1; i < sig.length; ++i) {
      type.parameters.push(typeNames[sig[i]]);
    }
    return type;
  },
  generateFuncType: (sig, target) => {
    const sigRet = sig.slice(0, 1);
    const sigParam = sig.slice(1);
    const typeCodes = { i: 127, p: 127, j: 126, f: 125, d: 124, e: 111 };
    target.push(96);
    Pdfium.uleb128Encode(sigParam.length, target);
    for (let i = 0; i < sigParam.length; ++i) {
      target.push(typeCodes[sigParam[i]]);
    }
    if (sigRet == 'v') {
      target.push(0);
    } else {
      target.push(1, typeCodes[sigRet]);
    }
  },
  convertJsFunctionToWasm: (func, sig) => {
    if (typeof WebAssembly.Function == 'function') {
      return new WebAssembly.Function(Pdfium.sigToWasmTypes(sig), func);
    }
    const typeSectionBody = [1];
    Pdfium.generateFuncType(sig, typeSectionBody);
    const bytes = [0, 97, 115, 109, 1, 0, 0, 0, 1];
    Pdfium.uleb128Encode(typeSectionBody.length, bytes);
    bytes.push(...typeSectionBody);
    bytes.push(2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0);
    const module = new WebAssembly.Module(new Uint8Array(bytes));
    const instance = new WebAssembly.Instance(module, { e: { f: func } });
    const wrappedFunc = instance.exports['f'];
    return wrappedFunc;
  },
  updateTableMap: (offset, count) => {
    if (Pdfium.functionsInTableMap) {
      for (let i = offset; i < offset + count; i++) {
        const item = Pdfium.wasmTable.get(i);
        if (item) {
          Pdfium.functionsInTableMap.set(item, i);
        }
      }
    }
  },
  getFunctionAddress: (func) => {
    if (!Pdfium.functionsInTableMap) {
      Pdfium.functionsInTableMap = new WeakMap();
      Pdfium.updateTableMap(0, Pdfium.wasmTable.length);
    }
    return Pdfium.functionsInTableMap.get(func) || 0;
  },
  getEmptyTableSlot: () => {
    if (Pdfium.freeTableIndexes.length) return Pdfium.freeTableIndexes.pop();
    try {
      Pdfium.wasmTable.grow(1);
    } catch (err) {
      if (!(err instanceof RangeError)) {
        throw err;
      }
      throw 'Unable to grow wasm table. Set ALLOW_TABLE_GROWTH.';
    }
    return Pdfium.wasmTable.length - 1;
  },
  /**
   * @param {function} func Function to add
   * @param {string} sig Signature of the function
   * @return {number} Function index in the table
   */
  addFunction: (func, sig) => {
    const rtn = Pdfium.getFunctionAddress(func);
    if (rtn) {
      return rtn;
    }
    const ret = Pdfium.getEmptyTableSlot();
    try {
      Pdfium.wasmTable.set(ret, func);
    } catch (err) {
      if (!(err instanceof TypeError)) {
        throw err;
      }
      const wrapped = Pdfium.convertJsFunctionToWasm(func, sig);
      Pdfium.wasmTable.set(ret, wrapped);
    }
    Pdfium.functionsInTableMap.set(func, ret);
    return ret;
  },
  removeFunction: (index) => {
    Pdfium.functionsInTableMap.delete(Pdfium.wasmTable.get(index));
    Pdfium.wasmTable.set(index, null);
    Pdfium.freeTableIndexes.push(index);
  },
};

/**
 * @typedef {Object} FileContext Defines I/O functions for a file
 * @property {number} size File size
 * @property {function(FileDescriptorContext, Uint8Array):number} read read(context, data)
 * @property {function(FileDescriptorContext):void|undefined} close close(context)
 * @property {function(FileDescriptorContext, Uint8Array):number|undefined} write write(context, data)
 * @property {function(FileDescriptorContext):number|undefined} sync sync(context)
 */

/**
 * @typedef {Object} FileDescriptorContext Defines I/O functions for a file descriptor
 * @property {number} size File size
 * @property {function(FileDescriptorContext, Uint8Array):number} read read(context, data)
 * @property {function(FileDescriptorContext):void|undefined} close close(context)
 * @property {function(FileDescriptorContext, Uint8Array):number|undefined} write write(context, data)
 * @property {function(FileDescriptorContext):number|undefined} sync sync(context)
 * @property {string} fileName
 * @property {number} fd
 * @property {number} flags
 * @property {number} mode
 * @property {number} dirfd
 * @property {number} position Current position
 */

/**
 * @typedef {Object} DirectoryContext Defines I/O functions for a directory file descriptor
 * @property {string[]} entries Directory entries (For directories, the name should be terminated with /)
 */

/**
 * @typedef {Object} DirectoryFileDescriptorContext Defines I/O functions for a directory file descriptor
 * @property {string[]} entries Directory entries (For directories, the name should be terminated with /)
 * @property {string} fileName
 * @property {number} fd
 * @property {number} dirfd
 * @property {number} position Current entry index
 */

/**
 * Emulate file system for PDFium
 */
class FileSystemEmulator {
  constructor() {
    /**
     * Filename to I/O functions/data
     * @type {Object<string, FileContext|DirectoryContext>}
     */
    this.fn2context = {};
    /**
     * File descriptor to I/O functions/data
     * @type {Object<number, FileDescriptorContext|DirectoryFileDescriptorContext>}
     */
    this.fd2context = {};
    /**
     * Last assigned file descriptor
     * @type {number}
     */
    this.fdAssignedLast = 1000;
  }

  /**
   * Register file
   * @param {string} fn Filename
   * @param {FileContext|DirectoryContext} context I/O functions/data
   */
  registerFile(fn, context) {
    this.fn2context[fn] = context;
  }

  /**
   * Register file with ArrayBuffer
   * @param {string} fn Filename
   * @param {ArrayBuffer} data File data
   */
  registerFileWithData(fn, data) {
    data = data.buffer != null ? data.buffer : data;
    this.registerFile(fn, {
      size: data.byteLength,
      read: function (context, buffer) {
        try {
          const size = Math.min(buffer.byteLength, data.byteLength - context.position);
          const array = new Uint8Array(data, context.position, size);
          buffer.set(array);
          context.position += array.byteLength;
          return array.length;
        } catch (err) {
          console.error(`read error: ${_error(err)}`);
          return 0;
        }
      },
    });
  }

  /**
   * Unregister file/directory context
   * @param {string} fn Filename
   */
  unregisterFile(fn) {
    delete this.fn2context[fn];
  }

  /**
   * Open a file
   * @param {number} dirfd Directory file descriptor
   * @param {number} fileNamePtr Pointer to buffer that contains filename
   * @param {number} flags File open flags
   * @param {number} mode File open mode
   * @returns {number} File descriptor
   */
  openFile(dirfd, fileNamePtr, flags, mode) {
    const fn = StringUtils.utf8BytesToString(new Uint8Array(Pdfium.memory.buffer, fileNamePtr, 2048));
    const funcs = this.fn2context[fn];
    if (funcs) {
      const fd = ++this.fdAssignedLast;
      this.fd2context[fd] = { ...funcs, fd, flags, mode, dirfd, position: 0 };
      return fd;
    }
    console.error(`openFile: not found: ${dirfd}/${fn}`);
    return -1;
  }

  /**
   * Close a file
   * @param {number} fd File descriptor
   */
  closeFile(fd) {
    const context = this.fd2context[fd];
    context.close?.call(context);
    delete this.fd2context[fd];
    return 0;
  }

  /**
   * Seek to a position in a file
   * @param {number} fd File descriptor
   * @returns {number} New offset
   */
  seek(fd) {
    let offset, whence, newOffset;
    if (arguments.length == 4) {
      // (fd: number, offset: BigInt, whence: number, newOffset: number)
      offset = Number(arguments[1]); // BigInt to Number
      whence = arguments[2];
      newOffset = arguments[3];
    } else if (arguments.length == 5) {
      // (fd: number, offset_low: number, offset_high: number, whence: number, newOffset: number)
      offset = arguments[1]; // offset_low; offset_high is ignored
      whence = arguments[3];
      newOffset = arguments[4];
    } else {
      throw new Error(`seek: invalid arguments count: ${arguments.length}`);
    }

    const context = this.fd2context[fd];
    switch (whence) {
      case 0: // SEEK_SET
        context.position = offset;
        break;
      case 1: // SEEK_CUR
        context.position += offset;
        break;
      case 2: // SEEK_END
        context.position = context.size + offset;
        break;
    }
    const offsetLowHigh = new Uint32Array(Pdfium.memory.buffer, newOffset, 2);
    offsetLowHigh[0] = context.position;
    offsetLowHigh[1] = 0;
    return 0;
  }

  /**
   * fd__write
   * @param {num} fd
   * @param {num} iovs
   * @param {num} iovs_len
   * @param {num} ret_ptr
   */
  write(fd, iovs, iovs_len, ret_ptr) {
    const context = this.fd2context[fd];
    let total = 0;
    for (let i = 0; i < iovs_len; i++) {
      const iov = new Int32Array(Pdfium.memory.buffer, iovs + i * 8, 2);
      const ptr = iov[0];
      const len = iov[1];
      const written = context.write(context, new Uint8Array(Pdfium.memory.buffer, ptr, len));
      total += written;
      if (written < len) break;
    }
    const bytes_written = new Uint32Array(Pdfium.memory.buffer, ret_ptr, 1);
    bytes_written[0] = written;
    return 0;
  }

  /**
   * fd_read
   * @param {num} fd
   * @param {num} iovs
   * @param {num} iovs_len
   * @param {num} ret_ptr
   */
  read(fd, iovs, iovs_len, ret_ptr) {
    /** @type {FileDescriptorContext} */
    const context = this.fd2context[fd];
    let total = 0;
    for (let i = 0; i < iovs_len; i++) {
      const iov = new Int32Array(Pdfium.memory.buffer, iovs + i * 8, 2);
      const ptr = iov[0];
      const len = iov[1];
      const read = context.read(context, new Uint8Array(Pdfium.memory.buffer, ptr, len));
      total += read;
      if (read < len) break;
    }
    const bytes_read = new Uint32Array(Pdfium.memory.buffer, ret_ptr, 1);
    bytes_read[0] = total;
    return 0;
  }

  sync(fd) {
    const context = this.fd2context[fd];
    return context.sync(context);
  }

  /**
   * __syscall_fstat64
   * @param {num} fd
   * @param {num} statbuf
   * @returns {num}
   */
  fstat(fd, statbuf) {
    const context = this.fd2context[fd];
    const buffer = new Int32Array(Pdfium.memory.buffer, statbuf, 92);
    buffer[6] = context.size; // st_size
    buffer[7] = 0;
    return 0;
  }

  /**
   * __syscall_stat64
   * @param {num} pathnamePtr
   * @param {num} statbuf
   * @returns {num}
   */
  stat64(pathnamePtr, statbuf) {
    const fn = StringUtils.utf8BytesToString(new Uint8Array(Pdfium.memory.buffer, pathnamePtr, 2048));
    const funcs = this.fn2context[fn];
    if (funcs) {
      const buffer = new Int32Array(Pdfium.memory.buffer, statbuf, 92);
      buffer[6] = funcs.size; // st_size
      buffer[7] = 0;
      return 0;
    }
    return -1;
  }

  /**
   * __syscall_getdents64
   * @param {num} fd
   * @param {num} dirp struct linux_dirent64
   * @param {num} count
   * @returns {num}
   */
  getdents64(fd, dirp, count) {
    /** @type {DirectoryFileDescriptorContext} */
    const context = this.fd2context[fd];
    const entries = context.entries;
    if (entries == null) return -1; // not a directory
    context.getdents_position = context.getdents_position || 0;
    let written = 0;
    const DT_REG = 8,
      DT_DIR = 4;
    _memset(dirp, 0, count);
    for (; context.position < entries.length; context.position++) {
      const i = context.position;
      let d_type, d_name;
      if (entries[i].endsWith('/')) {
        d_type = DT_DIR;
        d_name = entries[i].substring(0, entries[i].length - 1);
      } else {
        d_type = DT_REG;
        d_name = entries[i];
      }
      const d_nameLength = StringUtils.lengthBytesUTF8(d_name) + 1;
      const size = 8 + 8 + 2 + 1 + d_nameLength;
      if (written + size > count) break;

      const buffer = new Uint8Array(Pdfium.memory.buffer, dirp + written, size);
      // d_off
      const d_off = written + size;
      buffer[8] = d_off & 255;
      buffer[9] = (d_off >> 8) & 255;
      buffer[10] = (d_off >> 16) & 255;
      buffer[11] = (d_off >> 24) & 255;
      // d_reclen
      buffer[16] = size & 255;
      buffer[17] = (size >> 8) & 255;
      // d_type
      buffer[18] = d_type;
      // d_name
      StringUtils.stringToUtf8Bytes(d_name, new Uint8Array(Pdfium.memory.buffer, dirp + written + 19, d_nameLength));
      written = d_off;
    }
    return written;
  }
}

function _error(e) {
  return e.stack ? e.stack.toString() : e.toString();
}

function _notImplemented(name) {
  throw new Error(`${name} is not implemented`);
}

const fileSystem = new FileSystemEmulator();

const emEnv = {
  __assert_fail: function (condition, filename, line, func) {
    throw new Error(`Assertion failed: ${condition} at ${filename}:${line} (${func})`);
  },
  _emscripten_memcpy_js: function (dest, src, num) {
    new Uint8Array(Pdfium.memory.buffer).copyWithin(dest, src, src + num);
  },
  __syscall_openat: fileSystem.openFile.bind(fileSystem),
  __syscall_fstat64: fileSystem.fstat.bind(fileSystem),
  __syscall_ftruncate64: function (fd, zero, zero2, zero3) {
    _notImplemented('__syscall_ftruncate64');
  },
  __syscall_stat64: fileSystem.stat64.bind(fileSystem),
  __syscall_newfstatat: function (dirfd, pathnamePtr, statbuf, flags) {
    _notImplemented('__syscall_newfstatat');
  },
  __syscall_lstat64: function (pathnamePtr, statbuf) {
    _notImplemented('__syscall_lstat64');
  },
  __syscall_fcntl64: function (fd, cmd, arg) {
    _notImplemented('__syscall_fcntl64');
  },
  __syscall_ioctl: function (fd, request, arg) {
    _notImplemented('__syscall_ioctl');
  },
  __syscall_getdents64: fileSystem.getdents64.bind(fileSystem),
  __syscall_unlinkat: function (dirfd, pathnamePtr, flags) {
    _notImplemented('__syscall_unlinkat');
  },
  __syscall_rmdir: function (pathnamePtr) {
    _notImplemented('__syscall_rmdir');
  },
  _abort_js: function (what) {
    throw new Error(what);
  },
  _emscripten_throw_longjmp: function () {
    throw Infinity;
  },
  _gmtime_js: function (time, tmPtr) {
    time = Number(time);
    const date = new Date(time * 1000);
    const tm = new Int32Array(Pdfium.memory.buffer, tmPtr, 9);
    tm[0] = date.getUTCSeconds();
    tm[1] = date.getUTCMinutes();
    tm[2] = date.getUTCHours();
    tm[3] = date.getUTCDate();
    tm[4] = date.getUTCMonth();
    tm[5] = date.getUTCFullYear() - 1900;
    tm[6] = date.getUTCDay();
    tm[7] = 0; // dst
    tm[8] = 0; // gmtoff
  },
  _mmap_js: function (len, prot, flags, fd, offset_low, offset_high, allocated, addr) {
    _notImplemented('_mmap_js');
  },
  _munmap_js: function (addr, len, prot, flags, fd, offset_low, offset_high) {
    _notImplemented('_munmap_js');
  },
  _localtime_js: function (time, tmPtr) {
    time = Number(time);
    const date = new Date(time * 1000);
    const tm = new Int32Array(Pdfium.memory.buffer, tmPtr, 9);
    tm[0] = date.getSeconds();
    tm[1] = date.getMinutes();
    tm[2] = date.getHours();
    tm[3] = date.getDate();
    tm[4] = date.getMonth();
    tm[5] = date.getFullYear() - 1900;
    tm[6] = date.getDay();
    tm[7] = 0; // dst
    tm[8] = 0; // gmtoff
  },
  _tzset_js: function () {},
  emscripten_date_now: function () {
    return Date.now();
  },
  emscripten_errn: function () {
    _notImplemented('emscripten_errn');
  },
  emscripten_resize_heap: function (requestedSizeInBytes) {
    const maxHeapSizeInBytes = 2 * 1024 * 1024 * 1024; // 2GB
    if (requestedSizeInBytes > maxHeapSizeInBytes) {
      console.error(
        `emscripten_resize_heap: Cannot enlarge memory, asked for ${requestedPageCount} bytes but limit is ${maxHeapSizeInBytes}`
      );
      return false;
    }

    const pageSize = 65536;
    const oldPageCount = ((Pdfium.memory.buffer.byteLength + pageSize - 1) / pageSize) | 0;
    const requestedPageCount = ((requestedSizeInBytes + pageSize - 1) / pageSize) | 0;
    const newPageCount = Math.max(oldPageCount * 1.5, requestedPageCount) | 0;
    try {
      Pdfium.memory.grow(newPageCount - oldPageCount);
      console.log(`emscripten_resize_heap: ${oldPageCount} => ${newPageCount}`);
      return true;
    } catch (e) {
      console.error(`emscripten_resize_heap: Failed to resize heap: ${_error(e)}`);
      return false;
    }
  },
  exit: function (status) {
    _notImplemented('exit');
  },
  invoke_ii: function (index, a) {
    return Pdfium.invokeFunc(index, function (func) {
      return func(a);
    });
  },
  invoke_iii: function (index, a, b) {
    return Pdfium.invokeFunc(index, function (func) {
      return func(a, b);
    });
  },
  invoke_iiii: function (index, a, b, c) {
    return Pdfium.invokeFunc(index, function (func) {
      return func(a, b, c);
    });
  },
  invoke_iiiii: function (index, a, b, c, d) {
    return Pdfium.invokeFunc(index, function (func) {
      return func(a, b, c, d);
    });
  },
  invoke_v: function (index) {
    return Pdfium.invokeFunc(index, function (func) {
      func();
    });
  },
  invoke_viii: function (index, a, b, c) {
    Pdfium.invokeFunc(index, function (func) {
      func(a, b, c);
    });
  },
  invoke_viiii: function (index, a, b, c, d) {
    Pdfium.invokeFunc(index, function (func) {
      func(a, b, c, d);
    });
  },
  print: function (text) {
    console.log(text);
  },
  printErr: function (text) {
    console.error(text);
  },
};

const wasi = {
  proc_exit: function (code) {
    _notImplemented('proc_exit');
  },
  environ_sizes_get: function (environCount, environBufSize) {
    _notImplemented('environ_sizes_get');
  },
  environ_get: function (environ, environBuf) {
    _notImplemented('environ_get');
  },
  fd_close: fileSystem.closeFile.bind(fileSystem),
  fd_seek: fileSystem.seek.bind(fileSystem),
  fd_write: fileSystem.write.bind(fileSystem),
  fd_read: fileSystem.read.bind(fileSystem),
  fd_sync: fileSystem.sync.bind(fileSystem),
};

/**
 */
/**
 * String utilities
 */
class StringUtils {
  /**
   * UTF-16 string to bytes
   * @param {number[]} buffer
   * @returns {string} Converted string
   */
  static utf16BytesToString(buffer) {
    let endPtr = 0;
    while (buffer[endPtr] || buffer[endPtr + 1]) endPtr += 2;
    const str = new TextDecoder('utf-16le').decode(new Uint8Array(buffer.buffer, buffer.byteOffset, endPtr));
    return str;
  }
  /**
   * UTF-8 bytes to string
   * @param {number[]} buffer
   * @returns {string} Converted string
   */
  static utf8BytesToString(buffer) {
    let endPtr = 0;
    while (buffer[endPtr] && !(endPtr >= buffer.length)) ++endPtr;

    let str = '';
    let idx = 0;
    while (idx < endPtr) {
      let u0 = buffer[idx++];
      if (!(u0 & 0x80)) {
        str += String.fromCharCode(u0);
        continue;
      }
      const u1 = buffer[idx++] & 63;
      if ((u0 & 0xe0) == 0xc0) {
        str += String.fromCharCode(((u0 & 31) << 6) | u1);
        continue;
      }
      const u2 = buffer[idx++] & 63;
      if ((u0 & 0xf0) == 0xe0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (buffer[idx++] & 63);
      }
      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        const ch = u0 - 0x10000;
        str += String.fromCharCode(0xd800 | (ch >> 10), 0xdc00 | (ch & 0x3ff));
      }
    }
    return str;
  }
  /**
   * String to UTF-8 bytes
   * @param {string} str
   * @param {number[]} buffer
   * @returns {number} Number of bytes written to the buffer
   */
  static stringToUtf8Bytes(str, buffer) {
    let idx = 0;
    for (let i = 0; i < str.length; ++i) {
      let u = str.charCodeAt(i);
      if (u >= 0xd800 && u <= 0xdfff) {
        const u1 = str.charCodeAt(++i);
        u = (0x10000 + ((u & 0x3ff) << 10)) | (u1 & 0x3ff);
      }
      if (u <= 0x7f) {
        buffer[idx++] = u;
      } else if (u <= 0x7ff) {
        buffer[idx++] = 0xc0 | (u >> 6);
        buffer[idx++] = 0x80 | (u & 63);
      } else if (u <= 0xffff) {
        buffer[idx++] = 0xe0 | (u >> 12);
        buffer[idx++] = 0x80 | ((u >> 6) & 63);
        buffer[idx++] = 0x80 | (u & 63);
      } else {
        buffer[idx++] = 0xf0 | (u >> 18);
        buffer[idx++] = 0x80 | ((u >> 12) & 63);
        buffer[idx++] = 0x80 | ((u >> 6) & 63);
        buffer[idx++] = 0x80 | (u & 63);
      }
    }
    buffer[idx++] = 0;
    return idx;
  }
  /**
   * Calculate length of UTF-8 string in bytes (it does not contain the terminating '\0' character)
   * @param {string} str String to calculate length
   * @returns {number} Number of bytes
   */
  static lengthBytesUTF8(str) {
    let len = 0;
    for (let i = 0; i < str.length; ++i) {
      let u = str.charCodeAt(i);
      if (u >= 0xd800 && u <= 0xdfff) {
        u = (0x10000 + ((u & 0x3ff) << 10)) | (str.charCodeAt(++i) & 0x3ff);
      }
      if (u <= 0x7f) len += 1;
      else if (u <= 0x7ff) len += 2;
      else if (u <= 0xffff) len += 3;
      else len += 4;
    }
    return len;
  }
  /**
   * Allocate memory for UTF-8 string
   * @param {string} str
   * @returns {number} Pointer to allocated buffer that contains UTF-8 string. The buffer should be released by calling [freeUTF8].
   */
  static allocateUTF8(str) {
    if (str == null) return 0;
    const size = this.lengthBytesUTF8(str) + 1;
    const ptr = Pdfium.wasmExports.malloc(size);
    this.stringToUtf8Bytes(str, new Uint8Array(Pdfium.memory.buffer, ptr, size));
    return ptr;
  }
  /**
   * Release memory allocated for UTF-8 string
   * @param {number} ptr Pointer to allocated buffer
   */
  static freeUTF8(ptr) {
    Pdfium.wasmExports.free(ptr);
  }
}
