const MidnightLabs = artifacts.require("MidnightLabs");

module.exports = function(deployer) {
  deployer.deploy(MidnightLabs, "https://metadata.midnightlabs.com/metadata/", "Midnight Labs", "ML");
};


