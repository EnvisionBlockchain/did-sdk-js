const {
    FileId,
    TopicId,
} = require('@hashgraph/sdk');
const bs58 = require('bs58');
const {
    HcsDidMessage,
    MessageEnvelope,
    DidMethodOperation,
    HcsDid,
    ArraysUtils
} = require("../../dist");
const crypto = require('crypto');

const {assert} = require('chai');

const network = 'network';
const ADDRESS_BOOK_FID = FileId.fromString('0.0.1');
const DID_TOPIC_ID1 = TopicId.fromString('0.0.2');
const DID_TOPIC_ID2 = TopicId.fromString('0.0.3');

function encrypt(plainText, key, outputEncoding = "base64") {
    const cipher = crypto.createCipheriv("aes-128-ecb", crypto.createHash('sha256').update(String(key)).digest('base64').substr(0, 16), null);
    return Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]).toString(outputEncoding);
}

function decrypt(cipherText, key, outputEncoding = "utf8") {
    const cipher = crypto.createDecipheriv("aes-128-ecb", crypto.createHash('sha256').update(String(key)).digest('base64').substr(0, 16), null);
    return Buffer.concat([cipher.update(cipherText, 'base64'), cipher.final()]).toString(outputEncoding);
}

describe('HcsDidMessage', function() {
    it('Test Valid Message', async function() {
        const privateKey = HcsDid.generateDidRootKey();

        const did = new HcsDid(network, privateKey.publicKey, ADDRESS_BOOK_FID);
        const doc = did.generateDidDocument();
        const didJson = doc.toJSON();
        const originalEnvelope = HcsDidMessage.fromDidDocumentJson(didJson, DidMethodOperation.CREATE);
        const message = originalEnvelope.sign(msg => privateKey.sign(msg));

        const envelope = MessageEnvelope.fromJson(Buffer.from(message).toString("utf8"), HcsDidMessage);

        assert.isTrue(envelope.isSignatureValid(e => e.open().extractDidRootKey()));
        assert.isTrue(envelope.open().isValid(DID_TOPIC_ID1));
        assert.deepEqual(originalEnvelope.open().getTimestamp(), envelope.open().getTimestamp());
    });

    it('Test Encrypted Message', async function() {
        const secret = 'Secret encryption password';

        const privateKey = HcsDid.generateDidRootKey();
        const did = new HcsDid(network, privateKey.publicKey, ADDRESS_BOOK_FID);
        const doc = did.generateDidDocument();
        const didJson = doc.toJSON();

        const originalEnvelope = HcsDidMessage.fromDidDocumentJson(didJson, DidMethodOperation.CREATE);
        const encryptedMsg = originalEnvelope.encrypt(HcsDidMessage.getEncrypter(m => encrypt(m, secret)));
        const encryptedSignedMsg = MessageEnvelope.fromJson(ArraysUtils.toString(encryptedMsg.sign(m => privateKey.sign(m))), HcsDidMessage);

        assert.exists(encryptedSignedMsg);
        assert.throw(() => {encryptedSignedMsg.open()});

        const decryptedMsg = await encryptedSignedMsg.open(HcsDidMessage.getDecrypter((m, t) => decrypt(m, secret)));

        assert.exists(decryptedMsg);
        assert.equal(originalEnvelope.open().getDidDocumentBase64(), decryptedMsg.getDidDocumentBase64());
        assert.equal(originalEnvelope.open().getDid(), decryptedMsg.getDid());
    });

    it('Test Invalid Did', async function() {
        const privateKey = HcsDid.generateDidRootKey();
        const did = new HcsDid(network, privateKey.publicKey, ADDRESS_BOOK_FID);
        const doc = did.generateDidDocument();

        const didJson = doc.toJSON();
        const message = HcsDidMessage.fromDidDocumentJson(didJson, DidMethodOperation.CREATE).sign(msg => privateKey.sign(msg));
        const msg = MessageEnvelope.fromJson(Buffer.from(message).toString("utf8"), HcsDidMessage).open();

        const differentDid = new HcsDid(network, HcsDid.generateDidRootKey().publicKey, ADDRESS_BOOK_FID);
        msg.did = differentDid.toDid();

        assert.isFalse(msg.isValid());
    });

    it('Test Invalid Topic', async function() {
        const privateKey = HcsDid.generateDidRootKey();
        const did = new HcsDid(network, privateKey.publicKey, ADDRESS_BOOK_FID, DID_TOPIC_ID1);
        const doc = did.generateDidDocument();

        const didJson = doc.toJSON();
        const message = HcsDidMessage.fromDidDocumentJson(didJson, DidMethodOperation.CREATE).sign(msg => privateKey.sign(msg));
        const msg = await MessageEnvelope.fromJson(Buffer.from(message).toString("utf8"), HcsDidMessage).open();

        assert.isTrue(msg.isValid(DID_TOPIC_ID1));
        assert.isFalse(msg.isValid(DID_TOPIC_ID2));
    });

    it('Test Missing Data', async function() {
        const privateKey = HcsDid.generateDidRootKey();
        const did = new HcsDid(network, privateKey.publicKey, ADDRESS_BOOK_FID, DID_TOPIC_ID1);
        const doc = did.generateDidDocument();
        const operation = DidMethodOperation.CREATE;

        const didJson = doc.toJSON();
        const message = HcsDidMessage.fromDidDocumentJson(didJson, DidMethodOperation.CREATE).sign(msg => privateKey.sign(msg));

        const validMsg = MessageEnvelope.fromJson(Buffer.from(message).toString("utf8"), HcsDidMessage).open();

        let msg = new HcsDidMessage(operation, null, validMsg.getDidDocumentBase64());
        assert.isFalse(msg.isValid());

        msg = new HcsDidMessage(operation, validMsg.getDid(), null);
        assert.isFalse(msg.isValid());
        assert.notExists(msg.getDidDocument());
        assert.exists(msg.getDid());
        assert.equal(operation, msg.getOperation());
    });

    it('Test Invalid Signature', async function() {
        const privateKey = HcsDid.generateDidRootKey();
        const did = new HcsDid(network, privateKey.publicKey, ADDRESS_BOOK_FID, DID_TOPIC_ID1);
        const doc = did.generateDidDocument();

        const didJson = doc.toJSON();
        const message = HcsDidMessage.fromDidDocumentJson(didJson, DidMethodOperation.CREATE).sign(msg => HcsDid.generateDidRootKey().sign(msg));
        const envelope = MessageEnvelope.fromJson(Buffer.from(message).toString("utf8"), HcsDidMessage);

        assert.isFalse(envelope.isSignatureValid(e => e.open().extractDidRootKey()));
    });
});
