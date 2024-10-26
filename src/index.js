export default {
	async fetch(request, env, ctx) {
		let url = new URL(request.url);
		let ical = url.searchParams.get('ical');
		if (ical) {
			let icalUrl = ical.replace(/#/g, '%23');
			let ics = await (await fetch(icalUrl)).text();
			let calendar = parseICS(ics);
			let filteredCalendar = [];
			let filters = [];
			for (let [param, value] of url.searchParams.entries()) {
				if (param == 'ical') continue;
				let [type, key] = param.split(':');
				if (!key) key = '*';
				filters.push({
					type: type.toLowerCase(),
					key: key.toLowerCase(),
					value: value.toLowerCase(),
				})
			}
			let debug = url.searchParams.has('debug');
			if (filters.length == 0) return new Response(ics);
			for (let line of calendar) {
				if (Array.isArray(line)) {
					let skip = false;
					let event = Object.fromEntries(line.map((l) => [l.key.toLowerCase(), l.value.toLowerCase()]));
					for(let filter of filters) {
						let keys = [filter.key];
						if (filter.key == '*') keys = ['summary', 'description', 'location'];
						switch (filter.type) {
							case 'only':
								if (!keys.some(key => event[key] && event[key].includes(filter.value))) skip = true;
								break;
							case 'without':
								if (keys.some(key => event[key] && event[key].includes(filter.value))) skip = true;
								break;
						}
						if (skip) break;
					}
					if (skip) {
						if (debug) {
							line = line.map(l => ({ ...l, text: 'X-' + l.text }));
						} else {
							continue;
						}
					}
				}
				filteredCalendar.push(line);
			}
			let filteredICS = filteredCalendar.flat().map((l) => l.text).join('\n');
			return new Response(filteredICS);
		}
		return new Response(ical);
	},
};

function parseICS(ics) {
	let lines = ics.split(/[\r\n]+/);
	let calendar = [];
	let event;
	for (let text of lines) {
		if (text.startsWith(' ')) {
			let prevLine;
			if (event) prevLine = event[event.length - 1];
			else prevLine = calendar[calendar.length - 1];
			prevLine.text += '\n' + text;
			continue;
		}
		let line = { text };
		let m = /(?<key>[^:]+)[:](?<value>.*)/.exec(text);
		if (m) {
			line.key = m.groups.key;
			line.value = m.groups.value;
		}
		if (text == 'BEGIN:VEVENT') {
			event = [];
		}
		if (event) {
			event.push(line);
		} else {
			calendar.push(line);
		}
		if (text == 'END:VEVENT') {
			calendar.push(event);
			event = null;
		}
	}
	return calendar;
}
