if ('UA-160169257-1') {
	(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
		(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
		m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
		})(window,document,'script','https://www.google-analytics.com/analytics.js','ga');		

	ga('create', 'UA-160169257-1', 'auto', 'tracker');
	ga('tracker.send', 'pageview');

	let startState = window.history.state;
	setInterval(function() {
		let nowState = window.history.state;
		if (!nowState) {
			return;
		}
		if (!startState) {
			startState = nowState;
		}

		if (startState.path !== nowState.path) {
			ga('tracker.set', 'location', nowState.path);
			ga('tracker.set', 'page', nowState.path);
			ga('tracker.send', 'pageview');
			startState = nowState;
		}
	}, 33)
}
