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

describe('Teste atualização de partidas', () => {
   
    it('Etapa - 1: Criação partidas nova partidas', async () => {   
        let response = await api.__get__('createMatchesRealTimeDatabase()');



        //let response = await api.__get__('createMatchesRealTimeDatabase()');
        expect(response).toBe(true);              
    });
    
    
});

afterAll(() =>{
    adminStub.mockRestore();
   // testEnv.cleanup();
});