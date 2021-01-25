const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { HLTV, HLTVFactory } = require('hltv');
const serviceAccount = require("./serviceAccountKey.json");
const moment = require('moment-timezone');
const { database } = require('firebase-admin');
const fs = require('fs');
const { isNumber } = require('util');

admin.initializeApp({	
	credential: admin.credential.cert(serviceAccount),
	databaseURL: 'https://rusha-30776.firebaseio.com',
    storageBucket: 'gs://rusha-30776.appspot.com'
});

admin.firestore().settings({ ignoreUndefinedProperties: true })

const createMatchesRealTimeDatabase = async () => {
    //consulto partidas pelo package non-oficial da HLTV
    const matches = await HLTV.getMatches().then((res) => {   		  
        return res;
	});	

	let today = moment().tz('America/Sao_Paulo').format('YYYY/MM/DD HH:mm');	

	matches.forEach(async (item, idx) => {

		if ( item.team1 && item.team2  )
		{		
			let matchExistInLive = await admin.database().ref('/matches/live/' + item.id).once('value').then(function(snapshot) {
				return snapshot.exists();
			})

			let matchExistInFinish = await admin.database().ref('/matches/finish/' + item.id).once('value').then(function(snapshot) {
				return snapshot.exists();
			})

			admin.database().ref('/matches/upcoming/' + item.id).once('value').then( async function(snapshot) {							
				if (!matchExistInLive && !matchExistInFinish)
				{  
					let match = {
						match_id  : item.id,
						date      : item.date ? moment(new Date( item.date )).tz('America/Sao_Paulo').format("YYYY/MM/DD HH:mm") : '' ,
						team1_id  : typeof item.team1.id === 'undefined' ?  ''  : item.team1.id  ,
						team2_id  : typeof item.team2.id === 'undefined' ?  '' : item.team2.id ,
						team1_name: item.team1  ? item.team1.name : '',
						team2_name: item.team2  ? item.team2.name : '',
						format    : item.format ? item.format : '',
						event_id  : typeof item.event.id === 'undefined' ? '' : item.event.id,
						title     : item.title ? item.title : '', 
						event_name: item.event.name === 'undefined'  ? '' : item.event.name,
						stars     : item.stars ? item.stars : '',
						live      : item.live ? item.live : false,   
						maps      : item.map ?  JSON.stringify(item.map) : '',
						match_over: false,
						validated_bets: false,
						updated_at: today       
					};

					try {
						if ( match.live ) { 
							admin.database().ref('matches/live/' + item.id ).set(match);
						}else { 
							admin.database().ref('matches/upcoming/' + item.id ).set(match);
						}
					
					} catch (error) {
						console.log(error);
					
					}
					
				}
			});						
		}
	})	
		
	await Promise.all(matches);
	
};

const updateBetsMatchLive = async () => { 
	
	admin.database().ref('/matches/live').once('value').then(  function(matchSnap) {	
		if( matchSnap.exists() )
		{
			matchSnap.forEach( function (match) {
				admin.database().ref('/bets/opens')
							.orderByChild('match_id')
							.equalTo(match.val().match_id)
							.once('value')
							.then( betsSnap => { 
								if ( betsSnap.exists() )
								{
									console.log('Encontrei apostas '); 
									//console.log(betsSnap.exists() + ' match: ' + match.val().match_id);
									updateBetMapsMatch(match.val());
								}							
							})
							.catch( error => { 
								console.log("Erro updatebetsmatchLive " + error) 
							});
				
			});
		}
	}).catch ( error => {
		console.log(error);
	})
}	

const updateBetsMatchFinish = async () => {
	let now = moment().tz('America/Sao_Paulo').format('YYYY/MM/DD HH:mm');
	await admin.database().ref('/bets/opens')
		.orderByChild('date_match')
		.endAt(now)	
		.once('value')
		.then( async function(betsSnap) {	
			if( betsSnap.exists() )
			{		
				let arrayBetOpens = Object.entries(betsSnap.toJSON());				
				arrayBetOpens.forEach( bet => { 
					admin.database().ref('/matches/finish/' + bet[1].match_id)
						.once('value')
						.then( async function(matchSnap) {						
							if(matchSnap.exists()) { 									
								let result_bet = await check_bets(bet[1], matchSnap.val()) ? 'win' : 'lost';									
								let objBet = bet[1];

								objBet.result = result_bet;
								//objBet.updated_at = moment(new Date()).tz('America/Sao_Paulo').format('X');
		
								admin.database().ref('/bets/finish/' + bet[0]).update(objBet).then ( async snap => {
									console.log( bet[0], " aposta inserida nos finalizados");
									admin.database().ref('/bets/opens/' +  bet[0]).remove().then( async snap => {
										console.log( bet[0], "Removido bet dos abertos");
										updateScoreUsers(bet[1], result_bet == 'win' ? true : false);
									}).catch( error => {
										console.log(error)
									});			
								}).catch( error => {
									console.log(error)
								})		
								
								let pathUserBetsFinishes = '/user-bets/' + bet[1].user_uid + '/finish/' + bet[0];
								let pathUserBetsOpens = '/user-bets/' + bet[1].user_uid + '/opens/' + bet[0];
							
								await admin.database().ref(pathUserBetsFinishes).update(objBet).then ( async snap => {
									console.log('adicionado a aposta user-bets finalizados');
									await admin.database().ref(pathUserBetsOpens).remove().then( async snap => {
										console.log("Removido aposta user-bets opens");
									} ).catch( error => {
										console.log(error)
									})				
									}).catch( error => {
										console.log(error)
									})
								let bets = await getBetsOpens(matchSnap.val().match_id);	
								console.log(matchSnap.val().match_id, 'teste')
								if( bets.length == 0 ){ matchSnap.ref.update({ validated_bets: true  })	 }
							}
						
						});
				});

			
			}

	}).catch ( error => {
		console.log(error);
	})

	
	//old code
	// await admin.database().ref('/matches/finish')
	// 	.orderByChild('validated_bets')
	// 	.equalTo(false)
	// 	.once('value')
	// 	.then( function(matchSnap) {	

	// 		if( matchSnap.exists() )
	// 		{		
	// 			matchSnap.forEach( function (match) {
	// 				updateBetMapsMatch(match.val());	
	// 				updateBetGameMatchFinish(match.val());						
	// 			});			
	// 		}

	// }).catch ( error => {
	// 	console.log(error);
	// })
}	
		
const check_bets = async ( bet, match ) => {
	let type_bet = await getTypeBet( bet.type_bet_id );
	let win = false;
	let bet_result = {												
			map1 () { 					
				let map1Played = Object.hasOwnProperty.bind(match.result.maps[type_bet.type] || {})('winner');
				if ( map1Played ) { win = bet.team_id == match.result.maps[type_bet.type].winner.id };
			},
			map2 () { 
				let map2Played = Object.hasOwnProperty.bind(match.result.maps[type_bet.type]|| {})('winner');
				if ( map2Played ) { win = bet.team_id == match.result.maps[type_bet.type].winner.id };			
			},
			map3 () {					
				let map3Played = Object.hasOwnProperty.bind(match.result.maps[type_bet.type]|| {})('winner');
				if ( map3Played ) { win = bet.team_id == match.result.maps[type_bet.type].winner.id };		
			},
			map4 () { 
				let map4Played = Object.hasOwnProperty.bind(match.result.maps[type_bet.type]|| {})('winner');
				if ( map4Played ) { win = bet.team_id == match.result.maps[type_bet.type].winner.id };			
			},			
			map5 () { 
				let map5Played = Object.hasOwnProperty.bind(match.result.maps[type_bet.type]|| {})('winner');
				if ( map5Played ) { win = bet.team_id == match.result.maps[type_bet.type].winner.id };					
			},			
			map6 () { 
				let map6Played = Object.hasOwnProperty.bind(match.result.maps[type_bet.type]|| {})('winner');
				if ( map6Played ) { win = bet.team_id == match.result.maps[type_bet.type].winner.id };				
			},
			game () { 					
				let isThereWinner = Object.hasOwnProperty.bind(match.result || {})('winnerTeam');

				if ( isThereWinner ) { 
					win = bet.team_id == match.result.winnerTeam.id;
				}			
			},							
		}
	
	bet_result[type_bet.type]();
	
	
	return win;
}

const updateScoreUsers = async (bet, win) => {
	console.log('------------Inicio de gravação dos pontos do usuário---------------');
	
	const reward_points = parseInt(bet.reward_points); 
	const risk_points   = parseInt(bet.risk_loss_points);
	await getUserSnapUser(bet.user_uid).then( async userSnapUser => {
		console.log('Usuário encontrado, email cadastrado: '+ userSnapUser.val().email);
		let points_monthly = userSnapUser.val().rank_points_monthly;
		let points_yearly = userSnapUser.val().rank_points_yearly;					
		let new_points_monthly =  win ? points_monthly + reward_points :  points_monthly - risk_points;
		let new_points_yearly =   win ? points_yearly +  reward_points :  points_yearly - risk_points;
		
			if ( new_points_monthly < 0  )
			{
				new_points_monthly = 0;
			}
		
			if ( new_points_yearly < 0  )
			{
				new_points_yearly = 0;
			}
		
			userSnapUser.ref.update({ 
				rank_points_monthly: new_points_monthly, 
				rank_points_yearly: new_points_yearly  
			}).then( () => {
				
				let textLogResult = win ? ' ganhou ' : ' perdeu ';
				let textLogPoints =  win ? parseInt(reward_points) : parseInt(risk_points);
				
				console.log(userSnapUser.val().name + textLogResult +  textLogPoints + ' no score mensal!')
			})
			console.log('------------Fim de gravação dos pontos do usuário---------------');
		}).catch( error => {
			console.log(error);
			console.log('------------Fim de gravação dos pontos do usuário---------------');
		})		
}

const updateBetMapsMatch =  async (match) => {
	try {		
		
		let bets = await getBetsOpens(match.match_id);	
	
		if (bets.length > 0 ) 
		{	
			bets.forEach( async function(bet, index)  {
			
				let type_bet = await getTypeBet( bet[1].type_bet_id );

				if( type_bet.type.includes('map') )
				{	
					if ( match.result.maps[type_bet.type] )
					{
						if (match.result.maps[type_bet.type].winner !== undefined)
						{											
							// se houver vencedor e for do tipo mapa  eu executo a verificação da aposta									
							let result_bet = await check_bets(bet[1], matchSnap.val()) ? 'win' : 'lost';									
							let objBet = bet[1];

							objBet.result = result_bet;
							//objBet.updated_at = moment(new Date()).tz('America/Sao_Paulo').format('X');
	
							admin.database().ref('/bets/finish/' + bet[0]).update(objBet).then ( async snap => {
								console.log( bet[0], " aposta inserida nos finalizados");
								admin.database().ref('/bets/opens/' +  bet[0]).remove().then( async snap => {
									console.log( bet[0], "Removido bet dos abertos");
									updateScoreUsers(bet[1], result_bet == 'win' ? true : false);
								}).catch( error => {
									console.log(error)
								});			
							}).catch( error => {
								console.log(error)
							})		
							
							let pathUserBetsFinishes = '/user-bets/' + bet[1].user_uid + '/finish/' + bet[0];
							let pathUserBetsOpens = '/user-bets/' + bet[1].user_uid + '/opens/' + bet[0];
						
							await admin.database().ref(pathUserBetsFinishes).update(objBet).then ( async snap => {
								console.log('adicionado a aposta user-bets finalizados');
								await admin.database().ref(pathUserBetsOpens).remove().then( async snap => {
									console.log("Removido aposta user-bets opens");
								} ).catch( error => {
									console.log(error)
								})				
								}).catch( error => {
									console.log(error)
								})	
						}else {
							console.log('aposta nao possuí vencedor ainda')
						}
					}					
				}						
			})

			await Promise.all(bets);

		}else {
			await admin.database().ref('/matches/finish')
				.orderByChild('match_id')
				.equalTo(match.match_id)
				.once('value')
				.then( function(matchSnap) {	
					//se estiver finalizada a partida eu fecho e confirmo que nao sobrou nenhuma aposta para avaliação
					if( matchSnap.exists() )
					{		
						matchSnap.forEach( function (match) {
							match.ref.update({ validated_bets: true  })					
						});			
					}
				}).catch ( error => {
					console.log(error);
				})
		}
	} catch (error) {
		console.log('Mensagem: ' + error);
		console.log('matche: ' + match);
	}
}


const getBetsOpens = async (match_id) => {
	return await admin.database().ref('/bets/opens').orderByChild('match_id').equalTo(match_id)
		.once('value').then( function (snapBets) {
			if ( snapBets.exists() ) {	
				return Object.entries(snapBets.val());
			}else{ 					
				console.log('nenhuma aposta encontrada')	
				return [];						
			}	
	}, function(error) {
		console.error(error);
		return [];		
	});	
}
// const updateBetFinish =  async (match, matchRef) => {
// 	await admin.database().ref('/bets/opens').orderByChild('match_id').equalTo(match.match_id).once('value').then( async snapBets => {
			
// 		if ( snapBets.exists() ) {		
			
// 			for(let i = 0;  snapBets.numChildren() <= i; i++)
// 			{
				
// 			}
// 		}else{			
// 			matchRef.update({validated_bets: true})	
// 			console.log('Atualizei')			
// 		}
// 	});
// }

const check_bet_result = async (bet, match, type_bet) => {
	let win = false;
	let bet_result = {												
			map1 () { 					
				win = bet[1].team_id == match.result.maps.map1.winner.id
				console.log( bet[1].team_id + ' == ' + match.result.maps.map1.winner.id + '? ', win, 'map1');
			},
			map2 () { 
				win = bet[1].team_id == match.result.maps.map2.winner.id;	
				console.log( bet[1].team_id + ' == ' + match.result.maps.map2.winner.id + '? ', win, 'map2');			
			},
			map3 () { 
				win = bet[1].team_id == match.result.maps.map3.winner.id;	
				console.log( bet[1].team_id + ' == ' + match.result.maps.map3.winner.id + '? ', win, 'map3');			
			},
			map4 () { 
				win = bet[1].team_id == match.result.maps.map4.winner.id;	
				console.log( bet[1].team_id + ' == ' + match.result.maps.map4.winner.id + '? ', win, 'map4');			
			},			
			map5 () { 
				win = bet[1].team_id == match.result.maps.map5.winner.id;	
				console.log( bet[1].team_id + ' == ' + match.result.maps.map5.winner.id + '? ', win, 'map5');			
			},			
			map6 () { 
				win = bet[1].team_id == match.result.maps.map5.winner.id;	
				console.log( bet[1].team_id + ' == ' + match.result.maps.map6.winner.id + '? ', win, 'map5');			
			},
			game () { 
				win = bet[1].team_id == match.result.winnerTeam.id;	
				console.log( bet[1].team_id + ' == ' + match.result.winnerTeam.id + '? ', win);			
			},							
		}
	
	bet_result[type_bet.type]();
		
	return win;	
}


const check_match_have_bets =  async (match) => {
	await admin.database().ref('/bets/opens').orderByChild('match_id').equalTo(match.match_id).once('value').then( async snapBets => {
		if ( snapBets.exists() ) {				
			return false;							
		}else {
			return true;
		}
	});
}

const getUserSnapUser = async (user_uid) => {
	return await admin.database().ref('/users/' + user_uid).once('value').then( async snapUser => { 			
		return snapUser;
	});
}

const getUsersDatabaseRealtime = async () => {
	return await admin.database().ref('/users/').once('value').then( async snapUsers => { 			
		return snapUsers;
	});
}

const is_check_bet_by_match_found = async (match) => {
		await admin.database().ref('/bets/opens').orderByChild('match_id').equalTo(match.match_id).once('value').then( async snap => { 						
			snap.forEach( async bet => { 			
				let typeBet = await getTypeBet(bet.val().type_bet_id);
				let betObject = bet.val();											
				let isWinBet =  match.result.winnerTeam.id ==  bet.val().team_id;	

				await admin.database().ref('/users/' + bet.val().user_uid).once('value').then( async snapUser => { 			
						let newPointsRankUser = 
							{ 
								rank_points_monthly : parseInt(snapUser.val().rank_points_monthly) + parseInt(bet.val().reward_points),
								rank_points_yearly : parseInt(snapUser.val().rank_points_yearly) + parseInt(bet.val().reward_points)
							}

						await snapUser.ref.update(newPointsRankUser);
						await bet.ref.update({result : 'win'})
						
						betObject.result = 'win';

						await admin.database().ref('bets/finish/'+ bet.ref.key ).set(betObject);
						// //await admin.database().ref('bets/opens/'+ bet.ref.key ).remove();	

						await admin.database().ref('user-bets/'+ bet.val().user_uid + '/finish/'  + bet.ref.key ).set(betObject);
						// //await admin.database().ref('user-bets/opens/'+ bet.val().user_uid + '/'  + bet.ref.key ).remove();
					});		
				});																																																										
		});
	
}

const getTypeBet = async (type_bet_id) => {	
	return await admin.database().ref('/bet-types')
								.orderByChild('id')
								.equalTo(type_bet_id)
								.limitToFirst(1)
								.once('value')
								.then( snap => {

		let betType = null;

		if ( snap.exists() )
		{				
			snap.forEach( item => {
				betType = item.val();
			});
			
		}else{
			console.log('não encontrado tipo de aposta, função: getTypeBet');			
		}

		return betType;
	});
}

const updateMatchesLive =  async () => {
	let now = moment().tz('America/Sao_Paulo').format('YYYY/MM/DD HH:mm');	

	await admin.database().ref('/matches/live')
		.orderByChild('updated_at').limitToFirst(3)
			.once('value').then( async function(snapshot) {
				console.log(snapshot.numChildren() + " Founds");
				
				snapshot.forEach( async function (element) {
					let matchHLTV = null;
				
					if ( element.val().match_id === 'undefined' )
					{
						console.log(element, 'erro');
						return 
					}

					try {	
						matchHLTV = await HLTV.getMatch({id: element.val().match_id}).then((res) => {	
							//console.log(res);									
						return res;
					}).catch(error => {
						console.log(element.val())
						console.log(error, 'Erro getMatch HLTV');
					});		
		
					if ( matchHLTV )
					{			
						//processo de captura de resultados				
						let gameTypeBestOf = matchHLTV.format.replace(/\D/g,'');

						let result = {};
						let maps = {};
						let map_current = 'map1';

						for (let index = 0; index < gameTypeBestOf; index++) {
						
							let map = {};	

							if ( typeof matchHLTV.maps[index].result !== 'undefined') 
							{
								map.name = matchHLTV.maps[index].name;			
								map.result = matchHLTV.maps[index].result.substring(0, 5).replace('(', ''); 
								map.score_team1 = matchHLTV.maps[index].result.substring(0, 5).split(":")[0].replace(/\D/g,'');
								map.score_team2 = matchHLTV.maps[index].result.substring(0, 5).split(":")[1].replace(/\D/g,'');
								map.statsId = matchHLTV.maps[index].statsId;
								map.winner = null;
							}

							
							 
							//console.log( Number(map.score_team1) + Number(map.score_team2) >= 15, '' );

							let any_team_have_more_than_15_rounds = Number(map.score_team1) > 15 || Number(map.score_team2) > 15;
							
							//verifica se a partida tem algum time com score maior que 15						
							if ( any_team_have_more_than_15_rounds  )								
							{	//se houve match point alcançado a diferença vai maior que 1, ou seja: 2 
								if ( Math.abs(Number(map.score_team1) - Number(map.score_team2)) > 1 )
								{	//gravarei o vencedor! 
									if ( Number(map.score_team1) > Number(map.score_team2) )
									{
										map.winner = { id: matchHLTV.team1.id, name: matchHLTV.team1.name }
									}else {
										map.winner = { id: matchHLTV.team2.id, name: matchHLTV.team2.name }
									}
									
									map_current = 'map' + (+index + 2);
								}								
							}
							
							isNaN(map.score_team1, map.score_team2 ) ? map.winner = '-' : null;

							maps['map' + (+index + 1)] = JSON.parse( JSON.stringify(map));

							
						}	

						result.winnerTeam = matchHLTV.winnerTeam;
						result.maps = maps;
						result.match_id = matchHLTV.id;
						
						// atualização da partida
						let match = {	
							match_id  : element.val().match_id,			
							date      :  matchHLTV.date   ?  moment(new Date( matchHLTV.date )).tz('America/Sao_Paulo').format("YYYY/MM/DD HH:mm") : null ,
							team1_id  :  matchHLTV.team1  ? matchHLTV.team1.id : null ,
							team2_id  :  matchHLTV.team2  ? matchHLTV.team2.id  : null,
							team1_name:  matchHLTV.team1  ? matchHLTV.team1.name : null,
							team2_name:  matchHLTV.team2  ? matchHLTV.team2.name : null,
							format    :  matchHLTV.format ? matchHLTV.format : null,
							event_id  :  matchHLTV.event  ? matchHLTV.event.id : null,
							title     :  matchHLTV.title  ? matchHLTV.title : null, 
							event_name:  matchHLTV.event  ? matchHLTV.event.name : null,
							stars     :  matchHLTV.stars  ? matchHLTV.stars : null,
							live      :  matchHLTV.live   ? matchHLTV.live : false,   							
							match_over:  matchHLTV.status  == 'Match over' ?  true : false, 
							canceled  :  matchHLTV.status  == 'Match over' || 'Live' ?  false : true, 
							stats_id  :  matchHLTV.statsId,
							result    :  result,
							map_current : map_current,
							validated_bets: false,
							updated_at:  now      
						};	
							
						if (matchHLTV.status == 'Match over')
						{			
							match.map_current = 'N/D';	
							//adicionando dados dos resultado na tabela de resultados
							await admin.database().ref('matches/finish/' + element.val().match_id )
								.set(JSON.parse( JSON.stringify(match))).then( snap => {
									admin.database().ref('/matches/live/' + element.val().match_id).set(null);
								}).catch( error => {
									console.log(error)
								})	
						}else {
							admin.database().ref('/matches/live/' + element.val().match_id).update(JSON.parse( JSON.stringify(match)));
						}
					}	
				} catch (error) {
					console.log(error, 'Erro do trycatch snapshot.forEach')
					console.log('Match: ');				
				}	

										
				});
			

				return snapshot;
				
			});	
};

const updateMatchesUpcoming = async () => {

	let lastDay = moment(new Date()).tz('America/Sao_Paulo').subtract(1, 'day').format('YYYY/MM/DD HH:mm');
	let now = moment().tz('America/Sao_Paulo').format('YYYY/MM/DD HH:mm');	
	
	await admin.database().ref('/matches/upcoming').orderByChild('date')
			.startAt(lastDay)
			.endAt(now)
			.limitToFirst(2)
			.once('value').then( async function(snapshot) {
				console.log(snapshot.numChildren() + " Founds");
				if ( snapshot.numChildren() > 0) 
				{
					snapshot.forEach( async function (element) {
						let matchHLTV = null;	
							try {	
								matchHLTV = await HLTV.getMatch({id: element.val().match_id}).then((res) => {	
									//console.log(res);									
									return res;
								}).catch(error => {
									console.log(error, 'Erro getMatch HLTV');
								});		
			
							if ( matchHLTV )
							{			
									//processo de captura de resultados				
								let gameTypeBestOf = matchHLTV.format.replace(/\D/g,'');
		
								let result = {};
								let maps = {};
								let map_current = 'N/D';

								if (matchHLTV.live)
								{
									for (let index = 0; index < gameTypeBestOf; index++) {								
										let map = {};				
										let winner = {};
	
										map.name = matchHLTV.maps[index].name;			
										map.result = matchHLTV.maps[index].result.substring(0, 5).replace('(', ''); 
										map.score_team1 = matchHLTV.maps[index].result.substring(0, 5).split(":")[0].replace(/\D/g,'');
										map.score_team2 = matchHLTV.maps[index].result.substring(0, 5).split(":")[1].replace(/\D/g,'');
										map.statsId = matchHLTV.maps[index].statsId;
										map.winner = null;
										
										let trocou_lado = Number(map.score_team1) + Number(map.score_team2) >= 15;
	
										let any_team_have_more_than_15_rounds = Number(map.score_team1) > 15 || Number(map.score_team2) > 15;
										
										//verifica se a partida tem algum time com score maior que 15						
										if ( any_team_have_more_than_15_rounds  )								
										{	//se houve match point alcançado a diferença vai maior que 1, ou seja: 2, 
											if ( Math.abs(Number(map.score_team1) - Number(map.score_team2)) > 1 )
											{	//gravarei o vencedor! 
												if ( Number(map.score_team1) > Number(map.score_team2) )
												{
													map.winner = { id: matchHLTV.team1.id, name: matchHLTV.team1.name }
												}else {
													map.winner = { id: matchHLTV.team2.id, name: matchHLTV.team2.name }
												}
												
												map_current = 'map' + (+index + 2);
											}								
										}
										
										isNaN(map.score_team1, map.score_team2 ) ? map.winner = '-' : null;
										maps['map' + (+index + 1)] = JSON.parse( JSON.stringify(map));
									}	
			
									result.winnerTeam = matchHLTV.winnerTeam;
									result.maps = maps;
									result.match_id = matchHLTV.id;
								}
															
								// atualização da partida
								let match = {	
									match_id  : element.val().match_id,			
									date      :  matchHLTV.date   ? moment(new Date( matchHLTV.date )).tz('America/Sao_Paulo').format("YYYY/MM/DD HH:mm") : null ,
									team1_id  :  matchHLTV.team1  ? matchHLTV.team1.id : null ,
									team2_id  :  matchHLTV.team2  ? matchHLTV.team2.id  : null,
									team1_name:  matchHLTV.team1  ? matchHLTV.team1.name : null,
									team2_name:  matchHLTV.team2  ? matchHLTV.team2.name : null,
									format    :  matchHLTV.format ? matchHLTV.format : null,
									event_id  :  matchHLTV.event  ? matchHLTV.event.id : null,
									title     :  matchHLTV.title  ? matchHLTV.title : null, 
									event_name:  matchHLTV.event  ? matchHLTV.event.name : null,
									stars     :  matchHLTV.stars  ? matchHLTV.stars : null,
									live      :  matchHLTV.live   ? matchHLTV.live : false,   							
									match_over:  matchHLTV.status  == 'Match over' ?  true : false, 
									canceled  :  matchHLTV.status  == 'Match over' || 'Live' ?  false : true, 
									stats_id  :  matchHLTV.statsId,
									result: result,
									map_current: map_current,
									validated_bets: false,
									updated_at:  now      
								};	

								await admin.database().ref('/matches/was_read/' + element.val().match_id).update(JSON.parse( JSON.stringify(match)));

								if (matchHLTV.live)
								{
									await admin.database().ref('/matches/live/' + element.val().match_id)
										.update(JSON.parse( JSON.stringify(match) )).then( snap => {
											admin.database().ref('/matches/upcoming/' + element.val().match_id).set(null);
										}).catch( error => {
											console.log(error)
										})												
									
								} else if (matchHLTV.status == 'Match over') {			
									match.map_current = 'N/D';	
									//adicionando dados dos resultado na tabela de resultados
									await admin.database().ref('matches/finish/' + element.val().match_id )
										.set(JSON.parse( JSON.stringify(match))).then( snap => {
											admin.database().ref('/matches/upcoming/' + element.val().match_id).remove();
										}).catch( error => {
											console.log(error)
										})	
								}
							}								
						} catch (error) {
							console.log(error, 'Erro do trycatch snapshot.forEach')
							console.log('Match: ');				
						}	
											
					});
				}
	});

};

exports.getMatchesDatabaseRealTime = functions.https.onRequest( async (req, res) => { 
	let array_matches_live = [];
	let array_matches_today = [];
	let array_matches_tomorrow = [];		
	let array_matches = [];
	let date = null;

	if (req.query.name) { 
		console.log('tem busca') 
	} else { 
		console.log('Não tem!')
	}

	let matches_formatted = new Object();

	let tomorrow = moment().tz('America/Sao_Paulo').add(1, 'day').format('YYYY/MM/DD');	
	let today = moment().tz('America/Sao_Paulo').format('YYYY/MM/DD');	

	matches = await admin.database().ref('/matches/upcoming')				
				.once('value')
				.then(snapshot => {	
					let matchUpcoming = []
					
					if (snapshot.numChildren() > 0) {						
						snapshot.forEach(function(matchSnapshot) {
							if ( !matchSnapshot.val().live && ( matchSnapshot.val().team1_id & matchSnapshot.val().team2_id ) )
							{
								matchUpcoming.push(matchSnapshot.val());
							}
							
						});							
					}

					return matchUpcoming;
				});	

	array_matches_live = await admin.database().ref('/matches/live')							
								.once('value')
								.then(snapshot => {	
									let matchLive = []
									
									if (snapshot.numChildren() > 0) {						
										snapshot.forEach(function(matchSnapshot) {
											if ( matchSnapshot.val().live )
											{
												matchLive.push(matchSnapshot.val());
											}
											
										});							
									}

									return matchLive;
								});	


	matches.forEach( async (item) => {			

		item.date ? date = item.date.substring(0, 10) :  'Live';			

		switch (date) {
			case today:					
				array_matches_today.push(item);	
				break;
			case tomorrow:
				array_matches_tomorrow.push(item);					
				break;
			case 'Live':
				
				break;											
			default:				
				array_matches.push(item);
				break;
		}		

	});

	// this gives an object with dates as keys
	const groups = array_matches.reduce((groups, match) => {
		const date = match.date.substring(0, 10);

		if (!groups[date]) {
			groups[date] = [];
		}

		let queryParams = false;

		if ( req.query.name )
		{
			queryParams = (match.team1_name.toLowerCase().includes(req.query.name.toLowerCase()) 
							|| match.team2_name.toLowerCase().includes(req.query.name.toLowerCase()))
							|| match.event_name.toLowerCase().includes(req.query.name.toLowerCase())

			if( queryParams )
			{
				groups[date].push(match);
			}

		} else { 
			groups[date].push(match);
		}

	

		return groups;
	}, {});
	
	// Edit: to add it in the array format instead
	const groupArrays = Object.keys(groups).map((date) => {
		return {  
			title: date.substring(8, 10)+ '/' + date.substring(5, 7) + '/'  + date.substring(0, 4), 
			data: groups[date]
		};
	});

	// let hoje =	{title: 'hoje', "data" : array_matches_today };
	// 	{title: 'amanha'}, { "data" : array_matches_tomorrow },
	// 	{title: 'live'}, { "data" : array_matches_live },
	// 	{title: 'others'}, { "data" : groupArrays }

	// matches_formatted.data  = [ 
	// 	{ title: 'hoje', "data" : array_matches_today },
	// 	{ title: 'amanha',  "data" : array_matches_tomorrow },
	// 	{ title: 'live',  "data" : array_matches_live },
		
	// ];		
	let arrayData= []; 

	arrayData.push({ title: 'Live',  "data" : array_matches_live.filter( 
		item => { 
			let queryParams = true;

			if ( req.query.name )
			{
				queryParams = (item.team1_name.toLowerCase().includes(req.query.name.toLowerCase()) 
				|| item.team2_name.toLowerCase().includes(req.query.name.toLowerCase()))
				|| item.event_name.toLowerCase().includes(req.query.name.toLowerCase());			
			}	
			
			return queryParams;
		}
	)});

	arrayData.push(	{ title: 'Ainda hoje', "data" : array_matches_today.filter( 
		item => { 
			let queryParams = true;

			if ( req.query.name )
			{
				queryParams = (item.team1_name.toLowerCase().includes(req.query.name.toLowerCase()) 
				|| item.team2_name.toLowerCase().includes(req.query.name.toLowerCase()))
				|| item.event_name.toLowerCase().includes(req.query.name.toLowerCase());			
			}	
			
			return queryParams;
		}
	)})

	arrayData.push(	{ title: 'Amanhã',  "data" : array_matches_tomorrow.filter( 
		item => { 
			let queryParams = true;

			if ( req.query.name )
			{
				queryParams = (item.team1_name.toLowerCase().includes(req.query.name.toLowerCase()) 
				|| item.team2_name.toLowerCase().includes(req.query.name.toLowerCase()))
				|| item.event_name.toLowerCase().includes(req.query.name.toLowerCase());			
			}	
			
			return queryParams;
		}
	)})

	groupArrays.forEach(element => {
		arrayData.push(element);
	})


	matches_formatted.data = arrayData ;		

	return res.status(200).send(matches_formatted.data);
});

exports.createMatchesSchedule = functions.pubsub.schedule('*/8 * * * *').onRun( async (context) => {
	await createMatchesRealTimeDatabase();

	console.log('This will be run every 8 minutes!');
	return null;
});

exports.updateMatchesUpcomingSchedule = functions.pubsub.schedule('*/10 * * * *').onRun( async (context) => {
	await updateMatchesUpcoming();

	console.log('updateMatchesUpcoming will be run every 10 minutes!');
	return null;
});

exports.updateMatchesLiveSchedule = functions.pubsub.schedule('*/3 * * * *').onRun( async (context) => {
	await updateMatchesLive();

	console.log('updateMatchesLive will be run every 3 minutes!');
	return null;
});

exports.updateBetsMatchLiveSchedule = functions.pubsub.schedule('*/2 * * * *').onRun( async (context) => {
	await updateBetsMatchLive();

	console.log('updateBetsMatchLive will be run every 3 minutes!');
	return null;
});

exports.updateBetsMatchFinishSchedule = functions.pubsub.schedule('*/2 * * * *').onRun( async (context) => {
	await updateBetsMatchFinish();

	console.log('updateBetsMatchLive will be run every 3 minutes!');
	return null;
});

exports.updateRankingMonthly = functions.pubsub.schedule('*/3 * * * *').onRun( async (context) => {
	let users_ref = await getUsersDatabaseRealtime();
	let objsUser = Object.entries(users_ref.val());

	// sorting the mapped array containing the reduced values
	let sort = objsUser.sort(function(a, b) {	
		let result =  b[1].rank_points_monthly - a[1].rank_points_monthly;
		
		// if ( result  === 0 ){
		// 	result = b.win - a.win;
		// }
		
		return result;		
	});

	let mapped = sort.map( function( item, index ){
		item[1].rank_monthly = index+1;
		
		return item
	});

	mapped.forEach ( (item, index) => {
		admin.database().ref('/users/' + item[0]).update(item[1]);
		
	});

	console.log('updateBetsMatchFinish will be run every 3 minutes!');
	return res.json('Teste');
});

exports.updateRankingYearly  = functions.pubsub.schedule('*/3 * * * *').onRun( async (context) => {
	let users_ref = await getUsersDatabaseRealtime();
	let objsUser = Object.entries(users_ref.val());

	// sorting the mapped array containing the reduced values
	let sort = objsUser.sort(function(a, b) {	
		let result =  b[1].rank_points_yearly - a[1].rank_points_yearly;
		
		// if ( result  === 0 ){
		// 	result = b.win - a.win;
		// }
		
		return result;		
	});

	let mapped = sort.map( function( item, index ){
		item[1].rank_yearly = index+1;
		
		return item
	});

	mapped.forEach ( (item, index) => {
		admin.database().ref('/users/' + item[0]).update(item[1]);
		
	});

	console.log('updateBetsMatchFinish will be run every 3 minutes!');
	return res.json('Teste');
})

// exports.resetPointsMonthly = functions.pubsub.schedule('*/3 * * * *').onRun( async (context) => {
// 	let users_ref = await getUsersDatabaseRealtime();
// 	let objsUser = Object.entries(users_ref.val());
	
// 	objsUser.forEach ( (item, index) => {
// 		admin.database().ref('/users/' + item[0]).update({rank_points_monthly: 0, });		
// 	});

// 	console.log('updateBetsMatchFinish will be run every 3 minutes!');
// 	return res.json('Teste');
// });

const getTeamHTLV = async (team_id) => {
    let team = {};

    try {
        await HLTV.getTeam({id: team_id}).then(res => {
            team = res
        })
    } catch (error) {
        console.log(error);
    }

    return team;
}

exports.getRankTeam = functions.https.onRequest( async (req, res) => { 	
	let team = {};

	if ( req.query.teamid )
	{
		await admin.database()
				.ref('/teams/' + req.query.teamid)
				.once('value').then( async (snapTeam) => {
					if ( snapTeam.exists() ) 
					{
						team = snapTeam.val();
						
						let diff = moment(moment().tz('America/Sao_Paulo')).diff(moment(team.updated_at) , "days");
						if ( diff >= 7 )
						{
							team = await getTeamHTLV(req.query.teamid);
							team.updated_at = team.updated_at =  moment().tz('America/Sao_Paulo').format();;
							await admin.database().ref('/teams/' + team.id).update(JSON.parse(JSON.stringify(team)));
						}
					}else {
						team = await getTeamHTLV(req.query.teamid);
						team.updated_at = team.updated_at =  moment().tz('America/Sao_Paulo').format();;
						await admin.database().ref('/teams/' + team.id).update(JSON.parse(JSON.stringify(team)));
					}
				});		
	} else {
		return res.json({error: 'teamid is required'});
	}
	
	let tier = await admin.database().ref('/tier-by-rank/' + team.rank).once('value').then( function (snapTier) { 
		if ( snapTier.exists() )
		{
			return snapTier.val();
		}else {
			return { tier: 7 }
		}		
	});

	team.tier = tier.tier;

	if ( req.query.tier )
	{
		return res.json(team.tier);
	}

    return res.json(team)
});


exports.teste = functions.https.onRequest( async (req, res) => { 

    
});


// const rankByTier = () => { 

//     let rating_range = {
//         tier_1: Array(3).fill(1).map((x, y) => {   
//             return {
//                 rank: x + y,
//                 tier: 1,
//                 percent: 40
//             } 
//         }),
//         tier_2: Array(4).fill(4).map((x, y) => {   
//             return {
//                 rank: x + y,
//                 tier: 2,
//                 percent: 35
//             } 
//         }),
//         tier_3: Array(3).fill(8).map((x, y) => {   
//             return {
//                 rank: x + y,
//                 tier: 3,
//                 percent: 30
//             } 
//         }),
//         tier_4: Array(10).fill(11).map((x, y) => {   
//             return {
//                 rank: x + y,
//                 tier: 4,
//                 percent: 25
//             } 
//         }),
//         tier_5: Array(10).fill(21).map((x, y) => {   
//             return {
//                 rank: x + y,
//                 tier: 5,
//                 percent: 20
//             } 
//         }),
//         tier_6: Array(70).fill(31).map((x, y) => {   
//             return {
//                 rank: x + y,
//                 tier: 6,
//                 percent: 15
//             } 
//         }),        
//     }

//     let rating_all_tier = [ ];

//     rating_range.tier_1.forEach ( element => {  rating_all_tier.push(element) } );
//     rating_range.tier_2.forEach ( element => {  rating_all_tier.push(element) } );
//     rating_range.tier_3.forEach ( element => {  rating_all_tier.push(element) } );
//     rating_range.tier_4.forEach ( element => {  rating_all_tier.push(element) } );
//     rating_range.tier_5.forEach ( element => {  rating_all_tier.push(element) } );
//     rating_range.tier_6.forEach ( element => {  rating_all_tier.push(element) } );

//     return rating_all_tier;
// }

