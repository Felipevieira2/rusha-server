
const admin = require('firebase-admin');
const moment = require('moment-timezone');
const { HLTV } = require('hltv');

module.exports.updateScoreUsers = async (bet, result, betKey, titleNotification, msgNotification) => {
	const reward_points = parseInt(bet.reward_points);
	const risk_points = parseInt(bet.risk_loss_points);

	await getUserSnapUser(bet.user_uid).then(async userSnapUser => {		
		let points_monthly = userSnapUser.val().rank_points_monthly;
		let points_yearly = userSnapUser.val().rank_points_yearly;
		let now = moment().tz('America/Sao_Paulo').format('YYYY/MM/DD HH:mm');

		if (result == 'map not played') {
			userSnapUser.ref.update({
				bet_points: userSnapUser.val().bet_points + bet.cost
			}).catch(error => {
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

			admin.database().ref('/users/' + bet.user_uid + '/notifications/' + betKey).set(newNotification).then(snapUser => { });
			
            } else {
                let new_points_monthly = result == 'win' ? Number(points_monthly) + Number(reward_points) : Number(points_monthly) - Number(risk_points);
                let new_points_yearly = result == 'win' ? Number(points_yearly) + Number(reward_points) : Number(points_yearly) - Number(risk_points);
                let type = result == 'win' ? 'win' : 'lost';

                if (new_points_monthly < 0) {
                    new_points_monthly = 0;
                }

                if (new_points_yearly < 0) {
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

                admin.database().ref('/users/' + bet.user_uid + '/notifications/' + betKey).set(newNotification).then(snapUser => { });
            }

        })
}

const getUserSnapUser = async (user_uid) => {
	return await admin.database().ref('/users/' + user_uid).once('value').then(async snapUser => {
		return snapUser;
	});
}