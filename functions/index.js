const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { HLTV, HLTVFactory } = require('hltv');
const serviceAccount = require("./serviceAccountKey.json");
const moment = require('moment-timezone');

admin.initializeApp({	
	credential: admin.credential.cert(serviceAccount),
	databaseURL: 'https://rusha-30776.firebaseio.com',
    storageBucket: 'gs://rusha-30776.appspot.com'
});

admin.firestore().settings({ ignoreUndefinedProperties: true })

const createMatchesRealTimeDatabase = async () => {
    //consulto partidas pelo package non-oficial da HLTV
	let result = true;

	try {			
		const matches = await HLTV.getMatches().then((res) => {   		  
			return res;
		});

		let today = moment().tz('America/Sao_Paulo').format('YYYY/MM/DD HH:mm');	
		
		matches.forEach(async (item, idx) => {

			if ( item.team1 && item.team2  )
			{	
				let matchExistInLive = await admin.database().ref('/matches/live/' + item.id).once('value').then(function(snapshot) {
					return snapshot.exists();
				});

				let matchExistInFinish = await admin.database().ref('/matches/finish/' + item.id).once('value').then(function(snapshot) {
					return snapshot.exists();
				});
				
				let match = {
					match_id  : item.id,
					date      : item.date ? moment(new Date( item.date )).tz('America/Sao_Paulo').format("YYYY/MM/DD HH:mm") : '' ,
					team1_id  : typeof item.team1.id === 'undefined' ?  ''  : item.team1.id  ,
					team2_id  : typeof item.team2.id === 'undefined' ?  '' : item.team2.id ,
					team1_name: item.team1  ? item.team1.name : '',
					team2_name: item.team2  ? item.team2.name : '',
					team1: item.team1  ? item.team1 : '',
					team2: item.team1  ? item.team1 : '',
					format    : item.format ? item.format : '',
					event_id  : typeof item.event.id === 'undefined' ? '' : item.event.id,
					title     : item.title ? item.title : '', 
					event_name: item.event.name === 'undefined'  ? '' : item.event.name,
					stars     : item.stars ? item.stars : '',
					live      : item.live ? item.live : false,   
					maps      : item.map ?  JSON.stringify(item.map) : '',
					match_over: false,						
					updated_at: today       
				};
				
				admin.database().ref('/matches/upcoming/' + item.id).once('value').then( async function(snapshot) {							
					if ((!matchExistInLive && !matchExistInFinish) && (!snapshot.exists() && !item.live))
					{  											
						admin.database().ref('matches/upcoming/' + item.id ).update(JSON.parse( JSON.stringify(match)));
						
					}else if( (item.live == true && !matchExistInLive ) && !snapshot.exists() ){

							matchHLTV = await HLTV.getMatch({id: item.id}).then((res) => {	
								//console.log(res);									
								return res;
							}).catch(error => {								
								console.log(error, 'Erro getMatch HLTV');
								response = false;	
							});		
							console.log(matchHLTV, 'matchHLTV')
							if ( matchHLTV )
							{		
								let [team1, team2] = await Promise.all([getRankTeamMatch(matchHLTV.team1.id),
									getRankTeamMatch(matchHLTV.team2.id)]);
	
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
									
									isNaN(map.score_team1, map.score_team2 ) ? map.finish = false : null;
	
									maps['map' + (+index + 1)] = JSON.parse( JSON.stringify(map));
	
									
								}	
	
								result.winnerTeam = matchHLTV.winnerTeam;
								result.maps = maps;
								result.match_id = matchHLTV.id;
							
								// atualização da partida
								let match = {	
									match_id  : item.id,			
									date      :  matchHLTV.date   ?  moment(new Date( matchHLTV.date )).tz('America/Sao_Paulo').format("YYYY/MM/DD HH:mm") : null ,
									team1_id  :  matchHLTV.team1  ? matchHLTV.team1.id : null ,
									team2_id  :  matchHLTV.team2  ? matchHLTV.team2.id  : null,
									team1_name:  matchHLTV.team1  ? matchHLTV.team1.name : null,
									team2_name:  matchHLTV.team2  ? matchHLTV.team2.name : null,
									team1: team1,
									team2: team2,
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
								
								admin.database().ref('/matches/live/' + item.id).update(JSON.parse( JSON.stringify(match))).then( snap => {
									if ( snapshot.exists() )
									{
										admin.database().ref('/matches/upcoming/' + item.id).remove().catch( error => {
											console.log(error);
										});
									}
									
								}).catch( error => {
									console.log(error)
								})
						}	
						
					}																
				});						
			}			
		})	

		await Promise.all(matches);	
	} catch (error) {
		console.log(error);
		result = false;
	}	
	
	return result;
};

const updateBetsMatchLive = async () => {
	let response = true;
	
	try {
		admin.database().ref('/matches/live').once('value').then(  function(matchSnap) {	
			if( matchSnap.exists() )
			{
				matchSnap.forEach( function (match) {			
					admin
					.database()
					.ref('/bets/opens')
					.orderByChild('match_id')
					.equalTo(Number(match.val().match_id))
					.once('value')
					.then( betsSnap => { 
						if ( betsSnap.exists() )
						{
							console.log('Encontrei apostas '); 
							console.log(betsSnap.exists() + ' match: ' + match.val().match_id);
							updateBetMapsMatch(match.val());
						}						
						
					})
					.catch( error => { 
						console.log("Erro updatebetsmatchLive " + error) 
						response = false;
					});
		
				});
			}
		}).catch ( error => {
			console.log(error);
			response = false;
		})
	}catch (error) {
		console.log(error);
		response = false;
	}

	return response;
}	

const updateBetsMatchFinish = async () => {
	let response = true; 
	
	try {		
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
									let result_bet = await check_bets(bet[1], matchSnap.val());
									let objBet = bet[1];

									objBet.result = result_bet;
									//objBet.updated_at = moment(new Date()).tz('America/Sao_Paulo').format('X');
									let msgNotification = '';
									let titleNotification = '';

									switch (objBet.result) {
										case 'win':
											titleNotification = matchSnap.val().team1_name + ' x ' + matchSnap.val().team2_name +
											' - ' + bet[1].type_bet_name;
											
											msgNotification = 'Parabéns!!! Você apostou na' +
												bet[1].team_name +' e ganhou' + bet[1].reward_points  + ' pontos de score!'; 
											break;
										case 'lost':
											titleNotification = matchSnap.val().team1_name + ' x ' + matchSnap.val().team2_name +
											' - ' + bet[1].type_bet_name;
											
											msgNotification = 'Você apostou no(a) ' +
												bet[1].team_name +' e perdeu' + bet[1].risk_loss_points  + ' pontos de score!'; 
											break;
										case 'map not played':
											titleNotification = matchSnap.val().team1_name + ' x ' + matchSnap.val().team2_name +
											' - ' + bet[1].type_bet_name;
											
											msgNotification = bet[1].cost + ' pontos de aposta estornados.' +
											' O jogo encerrou antes do mapa ser jogado'; 
											break;								
										default:
											break;
									}

									admin.database().ref('/bets/finish/' + bet[0]).update(objBet).then ( async snap => {
										console.log( bet[0], " aposta inserida nos finalizados");
										admin.database().ref('/bets/opens/' +  bet[0]).remove().then( async snap => {
											console.log( bet[0], "Removido bet dos abertos");
											updateScoreUsers(bet[1], result_bet, bet[0], msgNotification, titleNotification);
										}).catch( error => {
											console.log(error);
											response = false;
										});			
									}).catch( error => {
										console.log(error);
										response = false;
									})		
									
									let pathUserBetsFinishes = '/user-bets/' + bet[1].user_uid + '/finish/' + bet[0];
									let pathUserBetsOpens = '/user-bets/' + bet[1].user_uid + '/opens/' + bet[0];
								
									await admin.database().ref(pathUserBetsFinishes).update(objBet).then ( async snap => {
										console.log('adicionado a aposta user-bets finalizados');
										await admin.database().ref(pathUserBetsOpens).remove().then( async snap => {
											console.log("Removido aposta user-bets opens");
										} ).catch( error => {
											console.log(error)
											response = false;
										})				
										}).catch( error => {
											console.log(error)
											response = false; 
										})
									let bets = await getBetsOpens(matchSnap.val().match_id);	
								
									if( bets.length == 0 ){ matchSnap.ref.update({ validated_bets: true  })	 }
								}
							
							});
					});				
				}

		}).catch ( error => {
			console.log(error);
			response = false;
		})

	} catch (error) {
		console.log(error);
		response = false;
	}

	return response;
}	
		
const check_bets = async ( bet, match ) => {
	let type_bet = await getTypeBet( bet.type_bet_id );
	let result = '';
	let bet_result = {												
			map1 () { 	
				
				let mapPlayed = Object.hasOwnProperty.bind(match.result.maps[type_bet.type] || {})('winner');

				if ( mapPlayed ) { 
					result = bet.team_id == match.result.maps[type_bet.type].winner.id ? 'win' : 'lost';
				}else if ( match.match_over == true && mapPlayed == false){
					result = 'map not played';
				}	

			},
			map2 () { 
				let mapPlayed = Object.hasOwnProperty.bind(match.result.maps[type_bet.type] || {})('winner');

				if ( mapPlayed ) { 
					result = bet.team_id == match.result.maps[type_bet.type].winner.id ? 'win' : 'lost';
				}else if ( match.match_over == true && mapPlayed == false){
					result = 'map not played';
				}
					
			},
			map3 () {					
				let mapPlayed = Object.hasOwnProperty.bind(match.result.maps[type_bet.type] || {})('winner');

				if ( mapPlayed ) { 
					result = bet.team_id == match.result.maps[type_bet.type].winner.id ? 'win' : 'lost';
				}else if ( match.match_over == true && mapPlayed == false){
					result = 'map not played';
				}
			},
			map4 () { 
				let mapPlayed = Object.hasOwnProperty.bind(match.result.maps[type_bet.type] || {})('winner');

				if ( mapPlayed ) { 
					result = bet.team_id == match.result.maps[type_bet.type].winner.id ? 'win' : 'lost';
				}else if ( match.match_over == true && mapPlayed == false){
					result = 'map not played';
				}			
			},			
			map5 () { 
				let mapPlayed = Object.hasOwnProperty.bind(match.result.maps[type_bet.type] || {})('winner');

				if ( mapPlayed ) { 
					result = bet.team_id == match.result.maps[type_bet.type].winner.id ? 'win' : 'lost';
				}else if ( match.match_over == true && mapPlayed == false){
					result = 'map not played';
				}				
			},			
			map6 () { 
				let mapPlayed = Object.hasOwnProperty.bind(match.result.maps[type_bet.type] || {})('winner');

				if ( mapPlayed ) { 
					result = bet.team_id == match.result.maps[type_bet.type].winner.id ? 'win' : 'lost';
				}else if ( match.match_over == true && mapPlayed == false){
					result = 'map not played';
				}			
			},
			game () { 					
				let isThereWinner = Object.hasOwnProperty.bind(match.result || {})('winnerTeam');

				if ( isThereWinner ) { 
					result = bet.team_id == match.result.maps[type_bet.type].winner.id ? 'win' : 'lost';
				}			
			},							
		}
	
	bet_result[type_bet.type]();
		
	return result;
}

const updateScoreUsers = async (bet, result, betKey, msgNotification, titleNotification) => {
	console.log('------------Inicio de gravação dos pontos do usuário---------------');
	
	const reward_points = parseInt(bet.reward_points); 
	const risk_points   = parseInt(bet.risk_loss_points);

	await getUserSnapUser(bet.user_uid).then( async userSnapUser => {
		console.log('Usuário encontrado, email cadastrado: '+ userSnapUser.val().email);
		let points_monthly = userSnapUser.val().rank_points_monthly;
		let points_yearly = userSnapUser.val().rank_points_yearly;	
		let now = moment().tz('America/Sao_Paulo').format('YYYY/MM/DD HH:mm');

		if( result == 'map not played')
		{
			userSnapUser.ref.update({ 
				bet_points: userSnapUser.val().bet_points + bet.cost		
			}).catch( error => {
				console.log(error);
			});

			let newNotification = {
				type: 'refund', 
				title: titleNotification,
				msg: msgNotification,
				date: now,
				status: 'notSent',
				was_read: false,
				first_notification: false,
				push_notification: false,
			};

			admin.database().ref('/users/' + bet.user_uid + '/notifications/' + betKey).set(newNotification).then( snapUser => {});
			//admin.database().ref('/users/' + user_uid + '/logs/' ).set(newNotification).then( snapUser => {});
		}else {
			let new_points_monthly =  result == 'win' ? Number(points_monthly) + Number(reward_points) :  Number(points_monthly) - Number(risk_points);
			let new_points_yearly =   result == 'win' ? Number(points_yearly) +  Number(reward_points) :  Number(points_yearly) - Number(risk_points);
			let type = result == 'win' ? 'win' : 'lost';			

			if ( new_points_monthly < 0  ){
				new_points_monthly = 0;
			}
		
			if ( new_points_yearly < 0 ){
				new_points_yearly = 0;
			}
			
			userSnapUser.ref.update({ 
				rank_points_monthly: new_points_monthly.toFixed(0), 
				rank_points_yearly: new_points_yearly.toFixed(0), 
			});

			let newNotification = {
				type: type, 
				msg: msgNotification,
				title: titleNotification,
				date: now,
				status: 'notSent',
				was_read: false,
				first_notification: false,
				push_notification: false,
			};

			admin.database().ref('/users/' + bet.user_uid + '/notifications/' + betKey).set(newNotification).then( snapUser => {} );	
		}
		
	})		
}

const updateBetMapsMatch =  async (match) => {
	let response = true;	
	try {				
		let bets = await getBetsOpens(match.match_id);		
		console.log(match.match_id, 'bets')
		if ( bets.length > 0 ){	
			bets.forEach( async function(bet, index) {			
				let type_bet = await getTypeBet( bet[1].type_bet_id );
				if( type_bet.type.includes('map') && match.result !== undefined)
				{							
					if ( Object.hasOwnProperty.bind(match.result.maps[type_bet.type] || {})('winner') )
					{										
						// se houver vencedor e for do tipo mapa  eu executo a verificação da aposta									
						let result_bet = await check_bets(bet[1], match);							
						let objBet = bet[1];

						objBet.result = result_bet;
						//objBet.updated_at = moment(new Date()).tz('America/Sao_Paulo').format('X');

						switch (objBet.result) {
							case 'win':
								titleNotification = match.team1_name + ' x ' + match.team2_name +
								' - ' + bet[1].type_bet_name;
								
								msgNotification = 'Parabéns!!! Você ganhou a aposta!' +
								 'Sua aposta: ' +	bet[1].team_name +', pontos ganhos:' + bet[1].reward_points  + ' de score!'; 
								break;
							case 'lost':
								titleNotification = match.team1_name + ' x ' + match.team2_name +
								' - ' + bet[1].type_bet_name;
								
								msgNotification = 'Infelizmente você perdeu a aposta. Sua aposta: ' +
									bet[1].team_name +' pontos perdidos: ' + bet[1].risk_loss_points; 
								break;
							case 'map not played':
								titleNotification = match.team1_name + ' x ' + match.team2_name +
								' - ' + bet[1].type_bet_name;
								
								msgNotification = ' O jogo encerrou antes do mapa ser jogado. ' +
								 bet[1].cost + ' pontos de aposta estornados.'; 
								break;
						
							default:
								break;
						}

						admin.database().ref('/bets/finish/' + bet[0]).update(objBet).then ( async snap => {
							console.log( bet[0], " aposta inserida nos finalizados");
							admin.database().ref('/bets/opens/' +  bet[0]).remove().then( async snap => {
								console.log( bet[0], "Removido bet dos abertos");
								updateScoreUsers(bet[1], result_bet, bet[0], msgNotification, titleNotification);
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
								response = false;	
							})				
							}).catch( error => {
								console.log(error)
								response = false;	
							})	
					}else {
						console.log('aposta nao possuí vencedor ainda')
					}										
				}						
			})

			await Promise.all(bets);

		}else {
			await admin.database().ref('/matches/finish')
				.orderByChild('match_id')
				.equalTo(Number(match.match_id))
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
		response = false;	
	}

	return response;
}


const getBetsOpens = async (match_id) => {
	return await admin.database().ref('/bets/opens').orderByChild('match_id').equalTo(Number(match_id))
		.once('value').then( function (snapBets) {
			console.log(snapBets.val(), 'uepa')
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

const getTypeBet = async (type_bet_id) => {	
	return await admin.database().ref('/bet-types')
					.orderByChild('id')
					.equalTo(Number(type_bet_id))
					.limitToFirst(1)
					.once('value')
					.then( snap => {

		let betType = null;

		if ( snap.exists() )
		{				
			snap.forEach( item => { betType = item.val(); });			
		}else{
			console.log('não encontrado tipo de aposta, função: getTypeBet');			
		}

		return betType;
	});
}
//atualiza partidas que estão live no banco de dados.
const updateMatchesLive =  async () => {
	let response = true;

	let now = moment().tz('America/Sao_Paulo').format('YYYY/MM/DD HH:mm');		
	await admin.database().ref('/matches/live')
		.orderByChild('updated_at').limitToFirst(4)
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
							response = false;	
						});		
		
						if ( matchHLTV )
						{		
							let team1 = await getRankTeamMatch(matchHLTV.team1.id);	
							let team2 = await getRankTeamMatch(matchHLTV.team2.id);		
						

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
								
								isNaN(map.score_team1, map.score_team2 ) ? map.finish = false : null;

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
								team1: team1,
								team2: team2,
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
						response = false;				
					}												
				});
			
		return snapshot;
				
	});	

	return response;
};

const updateMatchesUpcoming = async () => {
	let response = true;

	try {
		//let lastDay = moment(new Date()).tz('America/Sao_Paulo').subtract(1, 'day').format('YYYY/MM/DD HH:mm');
		let now = moment().tz('America/Sao_Paulo').format('YYYY/MM/DD HH:mm');		

		await admin.database().ref('/matches/upcoming')
				.orderByChild('updated_at')
				.limitToFirst(2)
				.once('value').then( async function(snapshot) {				
					if ( snapshot.exists() ) 
					{
						Object.entries(snapshot.val()).forEach( async function(element, index){
								let matchHLTV = null;				
								try {	
									matchHLTV = await HLTV.getMatch({id: element[0]}).then((res) => {	
										//console.log(res);									
										return res;
									}).catch(error => {
										console.log(error, 'Erro getMatch HLTV');
										response = false;
									});		
				
								if ( matchHLTV )
								{		
									let [team1, team2] = await Promise.all([getRankTeamMatch(matchHLTV.team1.id),
																	getRankTeamMatch(matchHLTV.team2.id)]);
									
									//processo de captura de resultados				
									let gameTypeBestOf = matchHLTV.format.replace(/\D/g,'');
			
									let result = {};
									let maps = {};
									let map_current = 'N/D';

									if (matchHLTV.live)
									{
										map_current = 'map1';

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
										match_id  : element[0],			
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
										team1: team1,
										team2: team2,							
										match_over:  matchHLTV.status  == 'Match over' ?  true : false, 
										canceled  :  matchHLTV.status  == 'Match over' || 'Live' ?  false : true, 
										stats_id  :  matchHLTV.statsId,
										result: result,
										map_current: map_current,
										validated_bets: false,
										updated_at:  now      
									};	
									
									admin.database().ref('/matches/was_read/' + element[0]).update(JSON.parse( JSON.stringify(match)));
									admin.database().ref('/matches/upcoming/' + element[0]).update(JSON.parse( JSON.stringify(match)));
									

									if ( matchHLTV.status == 'Match postponed' )
									{
										await admin.database().ref('/matches/postponed/' + element[0])
											.update(JSON.parse( JSON.stringify(match) )).then( snap => {
												admin.database().ref('/matches/upcoming/' + element[0]).remove().catch( error => {
													console.log(error);
												});
											}).catch( error => {
												console.log(error);
												response = false;	
											});
									}

									if ( matchHLTV.status == 'Match deleted' )
									{
										await admin.database().ref('/matches/deleted/' + element[0])
											.update(JSON.parse( JSON.stringify(match) )).then( snap => {
												admin.database().ref('/matches/upcoming/' + element[0]).remove().catch( error => {
													console.log(error);
												});
											}).catch( error => {
												console.log(error);
												response = false;	
											});
									}

									if (matchHLTV.live)
									{
										await admin.database().ref('/matches/live/' + element[0])
											.update(JSON.parse( JSON.stringify(match) )).then( snap => {
												admin.database().ref('/matches/upcoming/' + element[0]).remove().catch( error => {
													console.log(error);
												});
											}).catch( error => {
												console.log(error)
												response = false;	
											})												
										
									} else if (matchHLTV.status == 'Match over') {			
										match.map_current = 'N/D';	
										//adicionando dados dos resultado na tabela de resultados
										await admin.database().ref('matches/finish/' + element[0] )
											.set(JSON.parse( JSON.stringify(match))).then( snap => {
												admin.database().ref('/matches/upcoming/' + element[0]).remove().catch( error => {
													console.log(error);
													response = false;	
												});
											}).catch( error => {
												console.log(error)
											})	
									}
								}								
							} catch (error) {
								console.log(error, 'Erro do trycatch snapshot.forEach')
								
								response = false;		
							}	
												
						});
					}
		});
	}catch(error) { 
		console.log(error);
		response = false;
	}

	return response;
};


const updateMatchesUpcomingRefeature = async () => {

	let lastDay = moment(new Date()).tz('America/Sao_Paulo').subtract(1, 'day').format('YYYY/MM/DD HH:mm');
	let now = moment().tz('America/Sao_Paulo').format('YYYY/MM/DD HH:mm');	
	
	admin.database().ref('/matches/upcoming').orderByChild('updated_at')
		.startAt(lastDay)
		.endAt(now)
		.limitToFirst(3)
		.once('value').then( async function(snapshot) {
			console.log(snapshot.numChildren() + " Founds");				
			if ( snapshot.exists() ) 
			{
				// snapshot.forEach( async function(element, index){
				// 	console.log(element.val())
				// 	// let team1 = await getRankTeamMatch(matchHLTV.team1.id);	
				// 	// let team2 = await getRankTeamMatch(matchHLTV.team2.id);
				// });

				Object.entries(snapshot.val()).forEach( async function(element, index){
					console.log(element)
					// let team1 = await getRankTeamMatch(matchHLTV.team1.id);	
					// let team2 = await getRankTeamMatch(matchHLTV.team2.id);
				});
			}
	});
};

exports.getMatchesDatabaseRealTime = functions.https.onRequest( async (req, res) => { 
	//let array_matches_live = [];
	let array_matches_today = [];
	let array_matches_tomorrow = [];		
	let array_matches = [];
	let date = null;
	let matches_formatted = new Object();
	let tomorrow = moment().tz('America/Sao_Paulo').add(1, 'day').format('YYYY/MM/DD');	
	let today = moment().tz('America/Sao_Paulo').format('YYYY/MM/DD');	

	matches_promisse = admin.database().ref('/matches/upcoming')				
				.orderByKey()
				.limitToFirst(15)						
				.once('value')
				.then(snapshot => {	
					let matchUpcoming = []
					
					if (snapshot.numChildren() > 0) {	
					
						snapshot.forEach(function(matchSnapshot) {
							if ( !matchSnapshot.val().live && ( matchSnapshot.val().team1_id && matchSnapshot.val().team2_id ) )
							{
								matchUpcoming.push(matchSnapshot.val());
							}							
						});							
					}

					return matchUpcoming;
				});	
						
	array_matches_live_promisse = admin.database().ref('/matches/live')	
								.orderByKey()
								.limitToFirst(15)						
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

	let [matches, 
		array_matches_live ] = await Promise.all(
											[matches_promisse, array_matches_live_promisse]
										);	

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
	
	array_matches_today.sort((a, b) => { 
		const now = moment().tz('America/Sao_Paulo');

		return moment(new Date(a.date)).tz('America/Sao_Paulo').diff(now) - moment(new Date(b.date)).tz('America/Sao_Paulo').diff(now);
	});

	array_matches.sort((a, b) => { 
		const now = moment().tz('America/Sao_Paulo');

		return moment(new Date(a.date)).tz('America/Sao_Paulo').diff(now) - moment(new Date(b.date)).tz('America/Sao_Paulo').diff(now);
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

exports.createMatchesSchedule = functions.pubsub.schedule('*/10 * * * *').onRun( async (context) => {
	await createMatchesRealTimeDatabase();

	console.log('This will be run every 8 minutes!');
	return null;
});

exports.updateMatchesUpcomingSchedule = functions.pubsub.schedule('*/7 * * * *').onRun( async (context) => {
	await updateMatchesUpcoming();

	console.log('updateMatchesUpcoming will be run every 10 minutes!');
	return null;
});

exports.updateMatchesLiveSchedule = functions.pubsub.schedule('*/4 * * * *').onRun( async (context) => {
	await updateMatchesLive();

	console.log('updateMatchesLive will be run every 3 minutes!');
	return null;
});
exports.updatePlayersTeamSchedule = functions.pubsub.schedule('*/5 * * * *').onRun( async (context) => {
	await getTeamsWithoutUpdatedPlayer();

	console.log('updateBetsMatchLive will be run every 3 minutes!');
	return null;
});

exports.updateBetsMatchLiveSchedule = functions.pubsub.schedule('*/6 * * * *').onRun( async (context) => {
	await updateBetsMatchLive();

	console.log('updateBetsMatchLive will be run every 3 minutes!');
	return null;
});

exports.updateBetsMatchFinishSchedule = functions.pubsub.schedule('*/6 * * * *').onRun( async (context) => {
	await updateBetsMatchFinish();

	console.log('updateBetsMatchLive will be run every 3 minutes!');
	return null;
});

exports.updateRankingMonthly = functions.pubsub.schedule('*/10 * * * *').onRun( async (context) => {
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

	return null;
});

exports.onUserCreate = functions.https.onRequest( async (req, res) => { return 'teste' });

exports.updateRankingYearly  = functions.pubsub.schedule('*/8 * * * *').onRun( async (context) => {
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

	return null;
})

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

const getRankTeamMatch = async (team_id) => { 	
	let team = {};

	await admin.database()
			.ref('/teams/' + team_id)
			.once('value').then( async (snapTeam) => {
				if ( snapTeam.exists() ) 
				{
					team = snapTeam.val();
					
					let diff = moment(moment().tz('America/Sao_Paulo')).diff(moment(team.updated_at) , "days");

					if ( diff >= 14 )
					{
						teamHLTV = await getTeamHTLV(team_id);

						team.id  = teamHLTV.id;
						team.location = teamHLTV.location;
						team.name = teamHLTV.name;
						team.players = teamHLTV.players;
						team.rank = teamHLTV.rank;
						team.updated_at =  moment().tz('America/Sao_Paulo').format();

						await admin.database().ref('/teams/' + team.id).update(JSON.parse(JSON.stringify(team)));
					}
				}else {
					teamHLTV = await getTeamHTLV(team_id);

					team.id  = teamHLTV.id;
					team.location = teamHLTV.location;
					team.name = teamHLTV.name;
					team.players = teamHLTV.players;
					team.rank = teamHLTV.rank;
					team.updated_at = teamHLTV.updated_at =  moment().tz('America/Sao_Paulo').format();					

					await admin.database().ref('/teams/' + team.id).update(JSON.parse(JSON.stringify(team)));
				}
			});		
	
	let tier = await admin.database().ref('/tier-by-rank/' + team.rank).once('value').then( function (snapTier) { 
		if ( snapTier.exists() )
		{
			return snapTier.val();
		}else {
			return { tier: 7 }
		}		
	});

	team.tier = tier.tier;

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
		return res.status(200).send(team.tier);
	}

    return res.status(200).send(team);
});

exports.teste1 = functions.https.onRequest( async (req, res) => { 
	
	await getTeamsWithoutUpdatedPlayer();
});



exports.teste2 = functions.https.onRequest( async (req, res) => { 	
	const bet = { 
		cost:
		10,
		date_match:
		"2021/02/16 06:00",
		datetime:
		"2021/02/15 16:34",
		match_id:
		2346596,
		result:
		"",
		reward_points:
		"25",
		risk_loss_points:
		"13",
		team1_percentual_rank:
		50,
		team2_percentual_rank:
		50,
		team_id:
		10998,
		team_name:
		"Ninja",
		type_bet_id:
		3,
		type_bet_name:
		"Vencedor - Map 2",
		user_uid:
		"sV4LxdQYtNYl8mGStTXhdrWSLM52"
	}

	var newBetKey = admin.database().ref().child('bets').push().key;
	var updates = {};

	updates['/bets/opens/' + newBetKey] = bet;
	updates['/user-bets/v5ZakbLgrBeJs3nDIyouJViSUcG2/opens/' + newBetKey] = bet;

	admin.database().ref().update(updates, function(error) {
		if (error) {
			// The write failed...
			console.log(error);	
			console.log("error in insert bet, | File: Bet.js | Function: recordBet() |");	

			return false;
		} else {
			//Data saved successfully!
		

		}
	});	

	return res.json('match1');
});

exports.basicTest = function(){
    const a = 1;
    const b = 5;
    return a + b;
}

exports.update_points = functions.database.ref('/bets/opens/{key}').onCreate(event => {        
	if ( event.exists()  ){
		return admin.database()
		.ref('/users')
		.child(event.val().user_uid)
		.child('bet_points')
		.set(admin.database.ServerValue.increment(-Math.abs(Number(event.val().cost)))).then( () => {
			console.log('User: ', event.val().user_uid, ' efetuou uma aposta!', 
			'Custo: ', -Math.abs(Number(event.val().cost)),
			'Aposta Key: ', event.key)
		}).catch( error => { console.log(error) });
	} else { 
		return Promise.reject('Unknown error');
	}		
}); 

// exports.update_points = functions.database.ref('/bets/finish/{key}').onCreate(event => {        
// 	if ( event.exists()  ){
// 		return admin.database()
// 		.ref('/users')
// 		.child(event.val().user_uid)
// 		.child('bet_points')
// 		.set(admin.database.ServerValue.increment(-Math.abs(Number(event.val().cost)))).then( () => {
// 			console.log('User: ', event.val().user_uid, ' efetuou uma aposta!', 
// 			'Custo: ', -Math.abs(Number(event.val().cost)),
// 			'Aposta Key: ', event.key)
// 		}).catch( error => { console.log(error) });
// 	} else { 
// 		return Promise.reject('Unknown error');
// 	}		
// });

exports.getMatchHTLV = functions.https.onRequest( async (req, res) => { 
	let match = {};

	if ( req.query.id )
	{
		await HLTV.getMatch({id: req.query.id}).then((res) => {	
			//console.log(res);
			match = res;							
			return res;

		});

		return res.json(match);
	}
	else {
		return res.json({error: 'id field is required'});
	}
});




const updateLocationPlayer = async (player_id, team_id, index) =>  { 

	let player = await HLTV.getPlayer({id: player_id}).then((res) => {										
		return res;
	});
	
	admin.database().ref('/teams/' + team_id + '/players/' + index).update({country: player.country.name});
}

const getTeamsWithoutUpdatedPlayer = () => { 
	let result = true;

	try {
		admin.database().ref('/teams')
			.orderByChild('players_countrys_updated')
			.equalTo(false).limitToFirst(3)
			.once('value').then( snap => { 
				console.log(snap.exists())
				if(snap.exists())
				{				
					snap.forEach ( team => {					
						let playersWithoutCountry = Object.entries(team.child('players').val()).filter( e => {						
							return e[1].country == undefined;
						});
						
						if ( playersWithoutCountry.length > 0 )
						{
							playersWithoutCountry.forEach( player => {
								console.log('atualizando o time ', team.val().id)	
								updateLocationPlayer(player[1].id, team.val().id, player[0]);
								
							});
						}else{

							let brazilianPlayers = Object.entries(team.child('players').val()).fil2ter( e => {
							
								return e[1].country == 'Brazil';
							});

							if ( brazilianPlayers.length > 0 )
							{
								team.ref.update({player_br: true})					
							}else{
								team.ref.update({player_br: false})	
							}

							team.ref.update({players_countrys_updated: true, updated_at: moment().tz('America/Sao_Paulo').format() });			
						}	
						
					})
				}
		});
	} catch (error) {
		console.log(error);
		result = false;
	}

	return result;
}
