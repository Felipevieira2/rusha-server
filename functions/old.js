const is_check_bet_by_match_found = async (match) => {
	await admin.database().ref('/bets/opens').orderByChild('match_id').equalTo(Number(match.match_id)).once('value').then( async snap => { 						
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