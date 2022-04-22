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
    // Therefore we will have to find the signature manually via metamask
    // Step 1) Find the private key for account[0] and import into metamask.  This will be "signerAccount"
    // Step 2) Get account[1].  This will be "mintAccount"
    // Step 3) Open the Chrome Console and type
    //   > ethereum.enable()
    //   > let mintAccount = [enter this manually]
    //   > let signerAccount = [enter this manually]
    //   > let hash = await ethereum.request({method: 'web3_sha3', params: [mintAccount]})
    //   > let signature = await ethereum.request({method: "personal_sign", params: [hash, signerAccount]})
    // Step 4) Replace the signature below ("rightSignature") with the signature given in the Chrome Console

  const rightSignature = "0xf6b1ba6cd4a03c75792c282a420a79d643e14da623e87f22f9a061842ffa2e107fa9c34dc628588a5febcbc7160351e678cff9875c4ca0e169c8026276a009911c"
  const wrongSignature = "0xc0a4e4484d723c7a2162c6fb3e49e19bab9396cbc42c71240580154b295cff9e02c06bbc7f4079350c6f1cef1122f86ed3cc028f79255cf84e2b4c3e8da0e1d81b"
  let contract;
  beforeEach('should setup the contract instance', async () => {
    contract = await MidnightLabs.new("https://metadata.midnightlabs.com/metadata/", "Midnight Labs", "ML");
  });

  it('trying to mint with the wrong hash gives an error', async () => {
    const mintAccount = accounts[0]
    const wrongAccount = accounts[1]
    const hash = web3.utils.soliditySha3(wrongAccount)
    let errorReason = "";
    try {
      await contract.mint(hash, rightSignature, {from: mintAccount});
    } catch (err) {
      errorReason = getErrorReason(err);
    }
    assert.equal(errorReason, "MESSAGE_INVALID", "Mint should fail if hash does not match msg.sender")
  });

  it('trying to mint with the right hash but wrong signature gives an error', async () => {
    const mintAccount = accounts[0]
    const hash = web3.utils.soliditySha3(mintAccount)
    let errorReason = "";
    try {
      await contract.mint(hash, wrongSignature, {from: mintAccount});
    } catch (err) {
      errorReason = getErrorReason(err);
    }
    assert.equal(errorReason, "SIGNATURE_VALIDATION_FAILED", "Mint should fail if signature is not valid")
  });

  it('mints correctly but allows only 1 mint per address', async () => {    
    assert.equal(await contract.totalSupply(1), 0, "Total supply should be zero")
    const signerAccount = accounts[0]
    const mintAccount = accounts[1]
    const hash = web3.utils.soliditySha3(mintAccount)
    // ### Not Supported! ###
    //const signature = web3.eth.personal.sign(hash, signerAccount);
    await contract.setSignerAddress(signerAccount);
    await contract.mint(hash, rightSignature, {from: mintAccount});
    const newSupply = await contract.totalSupply(1);
    assert.equal(newSupply, 1, "Contract did not mint correctly")
    
    // try and mint another from the same address, it should fail
    let errorReason = "";
    try {
      await contract.mint(hash, rightSignature, {from: mintAccount});
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
