# Get a life

## Goal

Create a system which monitors daily network time (which is limited
by the Fritz router) and alerts via SMS (using Twilio's api)
to one or more mobile phones with custom messages depending on
how much time is remaining. This will be run in cron every 5 minutes.

## System Architecture

Usernames, passwords and tokens will be stored in a standard .env file

We use modern TypeScript and standard directory structures and 
keep a clean code base with useful comments
and error checking, especially when it comes to calling 3rd party APIs.
We prefer to store data as local files in JSON, but do use SQLLite
if that is better. There will be a cli tool which is run in cron,
but can also be used to query current status and recent messages sent.

No waffle, written with simple tests and cli tool which can 
emulate scenarios for testing.

### Finding out time used today

Fetch data from FritzBox which can be found at http://192.168.178.1/
the username and password will be available as FRITZ_USER and FRITZ_PASSWD
in the .env file

The session id (sid) will be fetched (see fritz-api node module for
example calls) and then the parental controls will get fetched with
something similar to the code below, but with SID_VALUE replaced with
the session id previously fetched

```js
fetch("http://192.168.178.1/data.lua", {
  "headers": {
    "accept": "*/*",
    "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
    "content-type": "application/x-www-form-urlencoded",
    "Referer": "http://192.168.178.1/",
    "Referrer-Policy": "same-origin"
  },
  "body": "xhr=1&sid=SID_VALUE&page=kidLis",
  "method": "POST"
});
```

And example of the body from the above can be found in `data_samples/fritz.html`
the device we are interested in will come from the `config.yaml` the
value for the sample data is `Leos-11` we are interested in the
span which currently has `<span title="00:04 of 02:10 hours">` but 
could say `<span title="Online time exhausted">` if there is no time left,
or `<span title="00:06 of 00:59 hours">` if only allowed under and hour.

In the config.yaml the allowed `TimeRulesByDay` schedule can be found,
along with the NumbersToSMS and their required MessageWhenRemainingMins
values based on each number which needs to be alerted.

State should be maintained along with logs so that we do not accidentally
message someone more than once per MessageWhenRemainingMins, but at the
same time it does not have to match the exact minute (because we are running
in cron every 5 mins) so make sure the logic is clear.

If the system should send an SMS then it should use the Twilio
and any official packages for doing so.  We should make sure to never
send more messages than we have MessageWhenRemainingMins records
per number per day, other than if the system is unable to fetch
the information from Fritz in which case it should be sent one
in the day to any number with the isAdmin flag as true