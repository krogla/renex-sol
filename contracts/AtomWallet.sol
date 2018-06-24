pragma solidity 0.4.24;

contract AtomWallet {

    struct Match {
        bytes32 buyID;
        bytes32 sellID;
        uint32 buyToken;
        uint32 sellToken;
        uint256 buyValue;
        uint256 sellValue;
    }

    mapping (bytes32=>Match) public getSettlementDetails;

    function setSettlementDetails(bytes32 _buyID, bytes32 _sellID, uint32 _buyToken, uint32 _sellToken, uint256 _lowTokenValue, uint32 _highTokenValue) public {
        uint256 buyValue;
        uint256 sellValue;

        if (_buyToken < _sellToken) {
            buyValue = _highTokenValue;
            sellValue = _lowTokenValue;
        } else {
            sellValue = _highTokenValue;
            buyValue = _lowTokenValue;
        }
        
        getSettlementDetails[_buyID] = Match({
            buyID: _buyID,
            sellID: _sellID,
            buyToken: _buyToken,
            sellToken: _sellToken,
            buyValue: buyValue,
            sellValue: sellValue
        });

        getSettlementDetails[_sellID] = Match({
            buyID: _sellID,
            sellID: _buyID,
            buyToken: _sellToken,
            sellToken: _buyToken,
            buyValue: sellValue,
            sellValue: buyValue
        });
    }

}