const { HLTV } = require('hltv');


module.exports.getMatchesHLTV = async () => {
    const matches = await HLTV.getMatches().then((res) => {   		  
        return res;
    });

    return matches;
}

module.exports.getMatch = async (id) => {
   return await HLTV.getMatch({id: 2346552}).then((res) => {	
        console.log(res);									
        return res;
    }).catch(error => {								
        console.log(error, 'Erro na função [module.exports.store] getMatch HLTV');
        response = false;	
    });		
}