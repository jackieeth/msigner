"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidArgumentError = void 0;
class InvalidArgumentError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InvalidArgumentError';
    }
}
exports.InvalidArgumentError = InvalidArgumentError;
//# sourceMappingURL=interfaces.js.map