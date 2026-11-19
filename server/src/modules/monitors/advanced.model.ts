import { Schema } from "mongoose";
const options = { _id: false };
export const httpConfigModel = new Schema(
  {
    authType: { type: String, enum: ["none", "bearer", "basic", "custom"], default: "none" },
    credentialsSaved: Boolean,
    bodySaved: Boolean,
    contentType: String,
    headers: [
      new Schema({ name: String, value: String, secret: Boolean, saved: Boolean }, options),
    ],
    keyword: new Schema({ text: String, caseSensitive: Boolean }, options),
    assertions: [
      new Schema({ path: String, operator: String, value: Schema.Types.Mixed }, options),
    ],
  },
  options,
);
export const tlsConfigModel = new Schema({ warningDays: Number }, options);
export const dnsConfigModel = new Schema(
  { recordType: String, expectedValues: [String], comparison: String },
  options,
);
export const protocolDetailsModel = new Schema(
  {
    method: String,
    destination: String,
    authType: String,
    expectedStatusCodes: [Number],
    assertionResults: [new Schema({ index: Number, passed: Boolean, message: String }, options)],
    certificateExpiresAt: Date,
    validFrom: Date,
    daysRemaining: Number,
    issuer: String,
    subject: String,
    subjectAltNames: [String],
    hostnameValid: Boolean,
    certificateValid: Boolean,
    hostname: String,
    recordType: String,
    values: [String],
    expectedValues: [String],
    classification: String,
    provider: String,
    lastSuccessfulLookup: Date,
    expiryDate: Date,
  },
  options,
);
