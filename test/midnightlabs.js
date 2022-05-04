const MidnightLabs = artifacts.require("MidnightLabs");

function getErrorReason(error) {
  // the error reason is stored in the tx hash, which we don't have access to, so get it from index
  return Object.values(error.data)[0].reason 
}

contract('MidnightLabs', async (accounts) => {
    //
    // The method #personal_sign is not supported in Truffle/Ganache!
    // ### The following line will fail ###
    //   const signature = web3.eth.personal.sign(hash, signerAccount);
    // https://github.com/trufflesuite/ganache/issues/540
    // 
    // Therefore we will have to find the signature via this method
    //   const { signature } = web3.eth.accounts.sign(hash, signerAccountPrivateKey)
    // Because we don't have the private keys of "accounts[]", we will
    // start the tests with our own signerAccount where we have the public and private keys
  const signerAccount = "0x0b91a38CD0082994A1597c56EB54662E12179751"
  const signerAccountPK = "46d7e242f1fad9b22e42b9e11dbb327dcfc84ba10596ba1987ee14663581ddf4"
  const wrongSignerAccount = "0xB80c3A38560b86c0F77e1370bF2808f044A3af50"
  const wrongSignerAccountPK = "babef7cbd491f060606aa77efd82aa39905a542a561441f973b00abd3232d72e"
  let contract;
  beforeEach('should setup the contract instance', async () => {
    contract = await MidnightLabs.new("https://metadata.midnightlabs.com/metadata/", "Midnight Labs", "ML");
    await contract.setSignerAddress(signerAccount);
  });

  it('trying to mint with the wrong hash gives an error', async () => {
    const mintAccount = accounts[0]
    const wrongAccount = accounts[1]
    const hash = web3.utils.soliditySha3(wrongAccount)
    const sig = await web3.eth.sign(hash, signerAccount)
    console.log(sig)
    const { signature } = web3.eth.accounts.sign(hash, signerAccountPK)
    let errorReason = "";
    try {
      await contract.mint(hash, signature, {from: mintAccount});
    } catch (err) {
      errorReason = getErrorReason(err);
    }
    assert.equal(errorReason, "MESSAGE_INVALID", "Mint should fail if hash does not match msg.sender")
  });

  it('trying to mint with the right hash but wrong signature gives an error', async () => {
    const mintAccount = accounts[0]
    const hash = web3.utils.soliditySha3(mintAccount)

    // use the wrong account to sign
    const { signature } = web3.eth.accounts.sign(hash, wrongSignerAccountPK)
    let errorReason = "";
    try {
      await contract.mint(hash, signature, {from: mintAccount});
    } catch (err) {
      errorReason = getErrorReason(err);
    }
    assert.equal(errorReason, "SIGNATURE_VALIDATION_FAILED", "Mint should fail if signature is not valid")
  });

  it('mints correctly but allows only 1 mint per address', async () => {    
    assert.equal(await contract.totalSupply(1), 0, "Total supply should be zero")

    const mintAccount = accounts[1]
    const hash = web3.utils.soliditySha3(mintAccount)
    const { signature } = web3.eth.accounts.sign(hash, signerAccountPK)
    await contract.mint(hash, signature, {from: mintAccount});
    const newSupply = await contract.totalSupply(1);
    assert.equal(newSupply, 1, "Contract did not mint correctly")
    
    // try and mint another from the same address, it should fail
    let errorReason = "";
    try {
      await contract.mint(hash, signature, {from: mintAccount});
    } catch (err) {
      errorReason = getErrorReason(err);
    }

    assert.equal(errorReason, "ADDRESS_HAS_ALREADY_MINTED_TOKEN", "Mint should fail address has already minted")
  });

  it('can gift NFTs but not more than the MAX_TOKENS', async () => {   
    const giftAccount1 = accounts[1]
    const giftAccount2 = accounts[2]
    await contract.gift([giftAccount1, giftAccount2], 100)
    const newSupply = await contract.totalSupply(1);
    const newBalance1 = await contract.balanceOf(giftAccount1, 1)
    const newBalance2 = await contract.balanceOf(giftAccount2, 1)
    let errorReason = "";

    assert.equal(newSupply, 200, "Contract did not gift correctly")
    assert.equal(newBalance1, 100, "Contract did not gift correctly")
    assert.equal(newBalance2, 100, "Contract did not gift correctly")

    // gift exactly 2000 tokens
    await contract.gift([giftAccount1, giftAccount2], 900)
    const newSupply2 = await contract.totalSupply(1);
    assert.equal(newSupply2, 2000, "Contract did not gift correctly")

    // gift one more token, this should fail as it it greater than MAX_TOKENS
    try {
      await contract.gift([giftAccount1], 1)
    } catch (err) {
      errorReason = getErrorReason(err);
    }

    assert.equal(errorReason, "MINT_TOO_LARGE", "Mint should fail if more than MAX_TOKENS are minted")
  });

  it('cant #adminMint the existing collection item', async () => {
    const itemId = 1;
    const amountTokens = 1;
    try {
      await contract.adminMint(accounts[0], 1, 1);
    } catch (err) {
      errorReason = getErrorReason(err);
    }
    assert.equal(errorReason, "CANNOT_MINT_EXISTING_TOKEN_ID", "Cannot #adminMint from existing collection")
  })

  it('can #adminMint a new item in the collection', async () => {
    const mintTo = accounts[1];
    const itemId = 333;
    const amountTokens = 5000;
    let errorReason = "";
    await contract.adminMint(mintTo, itemId, amountTokens);
    const newSupply = await contract.totalSupply(itemId);
    const newBalance = await contract.balanceOf(mintTo, itemId);
    assert.equal(newSupply, amountTokens, "#adminMint did not mint correctly")
    assert.equal(newBalance, amountTokens, "#adminMint did not mint correctly")

    // check that we can't mint additional tokens after calling #adminMint
    try {
      await contract.adminMint(mintTo, itemId, amountTokens);
    } catch (err) {
      errorReason = getErrorReason(err);
    }

    assert.equal(errorReason, "CANNOT_MINT_EXISTING_TOKEN_ID", "Cannot #adminMint from existing collection")
  });

});
