// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract MidnightLabs is ERC1155Supply, Ownable, Pausable {
    using ECDSA for bytes32;
    
    // nit: this is token name, not contract name
    // Contract name
    string public name;
    
    // nit: this is token symbol, not contract symbol
    // Contract symbol
    string public symbol;

    uint256 public constant TOKEN_ID = 1;
    uint256 public constant MAX_TOKENS = 2000;
    
    // probably want to set signerAddress value in the constructor vs having it hard coded like this.
    // Used to validate authorized mint addresses
    address private signerAddress = 0xabcB40408a94E94f563d64ded69A75a3098cBf59;

    // Used to ensure each new token id can only be minted once by the owner
    mapping (uint256 => bool) public collectionMinted;
    mapping (uint256 => string) public tokenURI;
    mapping (address => bool) public hasAddressMinted;
    
    // pass in signer address here
    constructor(
        string memory uriBase,
        string memory _name,
        string memory _symbol
    ) ERC1155(uriBase) {
        name = _name;
        symbol = _symbol;
        tokenURI[TOKEN_ID] = uriBase;
    }

    /**
     * Returns the custom URI for each token id. Overrides the default ERC-1155 single URI.
     */
    function uri(uint256 tokenId) public view override returns (string memory) {
        // If no URI exists for the specific id requested, fallback to the default ERC-1155 URI.
        if (bytes(tokenURI[tokenId]).length == 0) {
            return super.uri(tokenId);
        }
        return tokenURI[tokenId];
    }

    /**
     * Sets a URI for a specific token id.
     */
     // can make this external
    function setURI(string memory newTokenURI, uint256 tokenId) public onlyOwner {
        tokenURI[tokenId] = newTokenURI;
    }

    /**
     * Set the global default ERC-1155 base URI to be used for any tokens without unique URIs
     */
    // can make this external
    function setGlobalURI(string memory newTokenURI) public onlyOwner {
        _setURI(newTokenURI);
    }

    function setSignerAddress(address _signerAddress) external onlyOwner {
        // why do you need this require()? This can only be set by you so you're passing in the desired addres
        // even if its the 0 address (somehow this happens), you can just change it back.
        // itll save you some gas.
        require(_signerAddress != address(0));
        signerAddress = _signerAddress;
    }
    // can make this external
    function pause() public onlyOwner {
        _pause();
    }

    // can make this external
    function unpause() public onlyOwner {
        _unpause();
    }

    function verifyAddressSigner(bytes32 messageHash, bytes memory signature) private view returns (bool) {
        // construct messageHash using msg.sender here rather than passing it as an arg
        return signerAddress == messageHash.toEthSignedMessageHash().recover(signature);
    }

    function hashMessage(address sender) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(sender));
    }

    /**
     * @notice Allow minting of a single token by whitelisted addresses only
     */
    function mint(bytes32 messageHash, bytes calldata signature) external {
        require(totalSupply(TOKEN_ID) < MAX_TOKENS, "MAX_TOKEN_SUPPLY_REACHED");
        // nit: can just do require(!hasAddressMinted[msg.sender], "");
        require(hasAddressMinted[msg.sender] == false, "ADDRESS_HAS_ALREADY_MINTED_TOKEN");
        
        // no need to pass in messageHash as an arg and check that it equals hashMessage(msg.sender)
        // in verifyAddressSigner() ,  just compose the hash with msg.sender and check the signature.
        // less args to pass into this function and overall cleaner.
        require(hashMessage(msg.sender) == messageHash, "MESSAGE_INVALID");
        require(verifyAddressSigner(messageHash, signature), "SIGNATURE_VALIDATION_FAILED");

        hasAddressMinted[msg.sender] = true;

        _mint(msg.sender, TOKEN_ID, 1, "");

    }

    /**
     * @notice Allow minting of any future tokens as desired as part of the same collection,
     * which can then be transferred to another contract for distribution purposes
     */
     
     // this function initially confused me... I guess its IF you want to mint another token (not genesis)
     // in the future thats part of the same collection? But you need to either individually send or 
     // write a brand new distribution contract (like the comment says), but seems a little weird...
     // If you foresee more tokens, you could just write this contract in a general way where you can
     // "create" new tokens and have ppl mint those tokens via signatures again. 
     // Nothing wrong with this function, just a design suggestion, but feel free to keep if you want.
    function adminMint(address account, uint256 id, uint256 amount) public onlyOwner
    {
        require(!collectionMinted[id], "CANNOT_MINT_EXISTING_TOKEN_ID");
        require(id != TOKEN_ID, "CANNOT_MINT_EXISTING_TOKEN_ID");
        collectionMinted[id] = true;
        _mint(account, id, amount, "");
    }

    /**
     // do you mean `numberOfTokens`?
     * @notice Allow owner to send `mintNumber` tokens without cost to multiple addresses
     */
    function gift(address[] calldata receivers, uint256 numberOfTokens) external onlyOwner {
        require((totalSupply(TOKEN_ID) + (receivers.length * numberOfTokens)) <= MAX_TOKENS, "MINT_TOO_LARGE");
        
        // just to clarify, this sends EACH receiver `numberOfTokens` tokens. 
        // receivers = [addr1, addr2, addr2], numberOfTokens = 3 means
        // 12 tokens in total get sent. Just wanted to make sure this was desired behaviour.
        // You can make `numberOfToken` and array where each index is how many tokens you send
        // each respective receiver if you wanted more custom token sends.
        for (uint256 i = 0; i < receivers.length; i++) {
            _mint(receivers[i], TOKEN_ID, numberOfTokens, "");
        }
    }
    
    // is this true?
    // even if I pass in a non-existent tokenId with amount 0, safeTransferFrom() wouldnt actually
    // create a new token since its just going to add `0` to a non existing token in the mapping which
    // is the default value anyway?
    // Maybe Im not seeing a nuance in 1155s, would love to know :) 
    /**
     * @notice Override ERC1155 such that zero amount token transfers are disallowed to prevent arbitrary creation of new tokens in the collection.
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public override {
        require(amount > 0, "AMOUNT_CANNOT_BE_ZERO");
        return super.safeTransferFrom(from, to, id, amount, data);
    }

    /**
     * @notice When the contract is paused, all token transfers are prevented in case of emergency.
     */
    function _beforeTokenTransfer(address operator, address from, address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data)
        internal
        whenNotPaused
        override
    {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }

    function withdraw() external onlyOwner {
        // no need for this check, it just wastes gas.
        // I dont think the owner would call this voluntarily if there was no funds here?
        require(address(this).balance > 0, "BALANCE_IS_ZERO");
        payable(msg.sender).transfer(address(this).balance);
    }
}
