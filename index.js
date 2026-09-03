"use strict";

const spamDomains = require("./spam_domains.json");
const whitelistDomains = require("./whitelist_domains.json");

const coreSpamDomains = new Set(spamDomains.map(normalizeDomain).filter(Boolean));
const coreWhitelistDomains = new Set(whitelistDomains.map(normalizeDomain).filter(Boolean));
const customWhitelistDomains = new Set();
const customBlacklistDomains = new Set();

function normalizeDomain(value) {
  if (typeof value !== "string") return null;
  const domain = value.trim().toLowerCase().replace(/^@/, "").replace(/\\.+$/, "");
  if (!domain || domain.length > 253 || /\\s|[@/:\\\\]/.test(domain) || !domain.includes(".")) return null;
  return domain;
}

function extractDomain(email) {
  if (typeof email !== "string") return null;
  const value = email.trim().toLowerCase();
  if (!value || value.length > 254) return null;
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1 || value.indexOf("@") !== at) return null;
  return normalizeDomain(value.slice(at + 1));
}

function isSpam(email) {
  const domain = extractDomain(email);
  if (!domain) return false;
  if (coreWhitelistDomains.has(domain) || customWhitelistDomains.has(domain)) return false;
  return coreSpamDomains.has(domain) || customBlacklistDomains.has(domain);
}

function setOptions({ whitelist = [], customBlacklist = [] } = {}) {
  if (!Array.isArray(whitelist) || !Array.isArray(customBlacklist)) {
    throw new TypeError("whitelist and customBlacklist must be arrays of domains.");
  }
  whitelist.map(normalizeDomain).filter(Boolean).forEach(domain => customWhitelistDomains.add(domain));
  customBlacklist.map(normalizeDomain).filter(Boolean).forEach(domain => customBlacklistDomains.add(domain));
  return { whitelist: customWhitelistDomains.size, customBlacklist: customBlacklistDomains.size };
}

function resetOptions() {
  customWhitelistDomains.clear();
  customBlacklistDomains.clear();
}

module.exports = isSpam;
module.exports.isSpam = isSpam;
module.exports.setOptions = setOptions;
module.exports.resetOptions = resetOptions;
module.exports.extractDomain = extractDomain;
