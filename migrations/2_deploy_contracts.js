const MidnightLabs = artifacts.require("MidnightLabs");

module.exports = function(deployer) {
  deployer.deploy(MidnightLabs, "https://www.joinmidnightlabs.com/metadata/1.json", "Midnight Labs", "ML");
};


