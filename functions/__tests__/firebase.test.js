var rewire = require('rewire');

const api = rewire('../index');
const test = require('firebase-functions-test')({
    databaseURL: 'https://rusha-30776.firebaseio.com',
    storageBucket: 'rusha-30776.appspot.com',
    projectId: 'rusha-30776',
},'../serviceAccountKey.json');
const { data } =  require('./data');
const admin = require('firebase-admin');

jest.useFakeTimers()

let index,adminStub;

beforeAll(() =>{
    adminStub = jest.spyOn(admin, 'initializeApp');
    index = require('../index');
   
    return;
});

describe('Rusha testando funções', () => {
    // it('JOB - Procura e atualiza os jogadores dos times', () => {                
    //     expect(api.__get__('getTeamsWithoutUpdatedPlayer()')).toBe(true);        
    // });

    // it('FUNÇÃO HTTP - obter partidas', () => {   
    //     // A fake request object
    //     const req = {};
    //     // A fake response object, with a send
    //     const res = {
    //             send: (response) => {
    //             //Run the test in response callback of the HTTPS function
    //             expect(response.status).toBe(200);
    //             //done() is to be triggered to finish the function
    //             done();
    //         }
    //     };     

    //     index.getMatchesDatabaseRealTime(req,res)     
            
    // });

    // it('JOB - Cria partidas', async () => {   
    //     let response = await api.__get__('createMatchesRealTimeDatabase()');
    //     expect(response).toBe(true);              
    // });
    
    // it('JOB - Atualiza partidas agendadas', async () => {   
    //     let response = await api.__get__('updateMatchesUpcoming()');
    //     expect(response).toBe(true);              
    // }); 
    
    it('JOB - Atualiza partidas live', async () => {   
        let response = await api.__get__('updateMatchesLive()');
        expect(response).toBe(true);              
    }); 
    
    // it('FUNÇÃO BÁSICA - Busca Time HLTV', async () => {           
    //     let response = await api.__get__('getTeamHTLV(10304)');
    //     expect(response.id).toBe(10304);              
    // }); 

    // it('FUNÇÃO BÁSICA - Busca Time HLTV com Rank', async () => {           
    //     let response = await api.__get__('getRankTeamMatch(10304)');
    //     expect(response.id).toBe(10304);              
    // }); 

    // it('FUNÇÃO BÁSICA - Busca Time HLTV com Rank', async () => {           
    //     let response = await api.__get__('getRankTeamMatch(10304)');
    //     expect(response.id).toBe(10304);              
    // }); 

    // it('JOB - atualiza apostas de partidas Online', async () => {                
    //     expect(await api.__get__('updateBetsMatchLive()')).toBe(true);              
    // }); 

    // it('JOB - atualiza apostas de partidas acabadas', async () => {     
    //     //console.log(data)
    //     expect(await api.__get__('updateBetsMatchFinish()')).toBe(true);              
    // }); 

    // it('JOB - atualiza apostas de partidas acabadas', async () => {                
    //     expect(await api.__get__('updateBetMapsMatch()')).toBe(true);              
    // });
    
});

afterAll(() =>{
    adminStub.mockRestore();
   // testEnv.cleanup();
});