const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const moment = require('moment');
const salt = parseInt(process.env.SALT);
const { Schema, model } = mongoose;
const ObjectId = mongoose.Types.ObjectId

const userSchema = new Schema(
    {
        fullName: {
            type: String,
            required: true,
            maxlength: 50,
        },
        phoneNumber: {
            type: String,
            required: true,
            maxlength: 11,
        },
        email: {
            type: String,
            required: true,
            lowercase: true,
            match: [
                /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
                'Invalid email format',
            ],
            unique: true,
        },
        password: {
            type: String,
        },
        roleId: {
            type: ObjectId,
            required: true,
            ref: 'Role',
        },
        avatar: {
            originalName: {
                type: String,
                default: 'default.png',
            },
            fileName: {
                type: String,
                default: 'default.png',
            },
        },

        status: {
            type: String,
            required: true,
            enum: ['pending', 'active', 'archived'],
            default: 'pending',
        },
        activationKey: String,
        activatedAt: Date,
        resetPasswordKey: String,
        resetPasswordKeyCreatedAt: Date,
        loginAttempts: { type: Number, default: 0 },
        lockedAt: Date,
        oldPasswords: [String],
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
        loginAt: { type: Date, default: Date.now },
    },
    { toJSON: { virtuals: true } }
);

userSchema.virtual('avatarUrl').get(function () {
    return this.avatar.fileName;
});

userSchema.virtual('role', {
    ref: 'Role',
    localField: 'roleId',
    foreignField: '_id',
    justOne: true,
});

userSchema.virtual('isLocked').get(function () {
    const now = moment();
    const diff = now.diff(moment(this.lockedAt), 'minutes');
    return !!(this.lockedAt && diff < 10);
});

userSchema.methods.incrementLoginAttempts = async function (callback) {
    const now = moment();
    const diff = now.diff(moment(this.lockedAt), 'minutes');
    const lockExpired = !!(this.lockedAt && diff > 10);

    if (lockExpired) {
        await this.updateOne({
            $set: { loginAttempts: 0 },
            $unset: { lockedAt: 1 },
        });
        return callback();
    }

    const updates = { $inc: { loginAttempts: 1 } };
    const needToLock = !!(this.loginAttempts + 1 >= 10 && !this.isLocked);

    if (needToLock) {
        updates.$set = { lockedAt: moment() };
    }

    await this.updateOne(updates);
    return callback();
};

userSchema.methods.addPasswords = async function (password) {
    const passwordExist = this.oldPasswords.some((value) =>
        bcrypt.compareSync(password, value)
    );

    if (!passwordExist) {
        if (this.oldPasswords.length === 10) {
            await this.updateOne({
                $set: { 'oldPasswords.9': bcrypt.hashSync(password, salt) },
            });
        } else if (this.oldPasswords.length < 10) {
            await this.updateOne({
                $push: {
                    oldPasswords: bcrypt.hashSync(password, salt),
                },
            });
        }

        return false;
    } else {
        return true;
    }
};

userSchema.methods.checkPassword = function (password) {
    return bcrypt.compareSync(password, this.password);
};

userSchema.methods.encryptPassword = function (password) {
    return bcrypt.hashSync(password, salt);
};

userSchema.statics.projectionFields = function () {
    return {
        fullName: 1,
        phoneNumber: 1,
        status: 1,
        cnic: 1,
        email: 1,
        roleId: 1,
        avatar: 1,
        avatarUrl: 1,
        createdAt: 1,
        updatedAt: 1,
        loginAt: 1,
        ref: 1,
        'role.title': 1,
        'role._id': 1,
    };
};

module.exports = model('SystemUser', userSchema, 'systemUsers');
