/**
 * mileage
 */

/* Node modules */
const fs = require('fs');

/* Third-party modules */
const lruCache = require('lru-cache');
const mailgun = require('nodemailer-mailgun-transport');
const nodemailer = require('nodemailer');
const request = require('request-promise-native');
const yml = require('js-yaml');

/* Files */

function logger (message, data = {}) {
  console.log(JSON.stringify(message, data));
}

function secretOrEnvvar (secretFile, envvar) {
  let value;
  try {
    value = fs.readFileSync(secretFile, 'utf8');
  } catch (err) {
    value = process.env[envvar];
  }

  return value;
}

const config = {
  cache: {
    max: Number(process.env.CACHE_MAX),
    maxAge: Number(process.env.CACHE_MAX_AGE)
  },
  faas: {
    username: secretOrEnvvar('/run/secrets/cron-mileage-faas-username', 'FAAS_USERNAME'),
    password: secretOrEnvvar('/run/secrets/cron-mileage-faas-password', 'FAAS_PASSWORD'),
    url: process.env.FAAS_URL
  },
  freeagent: {
    mileageCategoryId: process.env.FREEAGENT_MILEAGE_CATEGORY_ID,
    token: secretOrEnvvar('/run/secrets/cron-mileage-freeagent-token', 'FREEAGENT_TOKEN')
  },
  google: {
    calendarId: secretOrEnvvar('/run/secrets/cron-mileage-google-calendarId', 'GOOGLE_CALENDAR_ID'),
    token: secretOrEnvvar('/run/secrets/cron-mileage-google-token', 'GOOGLE_TOKEN')
  },
  mailgun: {
    domain: secretOrEnvvar('/run/secrets/cron-mileage-mailgun-domain', 'MAILGUN_DOMAIN'),
    key: secretOrEnvvar('/run/secrets/cron-mileage-mailgun-key', 'MAILGUN_KEY')
  },
  notify: {
    from: secretOrEnvvar('/run/secrets/cron-mileage-notify-from', 'NOTIFY_FROM'),
    subject: process.env.NOTIFY_SUBJECT,
    to: secretOrEnvvar('/run/secrets/cron-mileage-notify-to', 'NOTIFY_TO')
  }
};

const emailer = nodemailer.createTransport(mailgun({
  auth: {
    api_key: config.mailgun.key,
    domain: config.mailgun.domain
  }
}));

const cache = lruCache({
  max: config.cache.max,
  maxAge: config.cache.maxAge
});

function faasRequest (opts) {
  const defaultOpts = {
    baseUrl: `${config.faas.url}/function`,
    method: 'POST',
    json: true
  };

  if (config.faas.username && config.faas.password) {
    defaultOpts.auth = {
      username: config.faas.username,
      password: config.faas.password
    };
  }

  return request.defaults(defaultOpts)(opts);
}

function createExpense (data) {
  const expense = {
    description: data.description,
    mileage: data.mileage,
    vehicle_type: data.vehicle_type || 'Car',
    engine_type: data.engine_type || 'Petrol',
    engine_size: data.engine_size || '1401-2000cc',
    dated_on: data.date,
    category: config.freeagent.mileageCategoryId
  };

  logger('Creating new expense', expense);

  return faasRequest({
    url: 'func_freeagent',
    body: {
      method: 'addExpense',
      args: [
        expense
      ],
      refreshToken: config.freeagent.token
    }
  }).then(res => {
    logger('New expense created', expense);

    return res;
  }).catch(err => {
    logger('Error creating expense', {
      err
    });

    return Promise.reject(err);
  });
}

function deleteEvent (eventId) {
  logger('Deleting event', {
    eventId
  });

  return faasRequest({
    url: 'func_google-calendar',
    body: {
      method: 'deleteCalendarEvent',
      args: {
        calendarId: config.google.calendarId,
        eventId
      },
      refreshToken: config.google.token
    }
  }).then(res => {
    logger('Successfully deleted event', {
      eventId
    });

    return res;
  }).catch(err => {
    logger('Error deleting event', {
      err
    });

    return Promise.reject(err);
  });
}

function getDistance (start, dest, isReturn = false) {
  /* Check cache */
  const key = `${start}:${dest}:${isReturn}`;
  const cachedData = cache.get(key);

  const data = {
    start,
    dest,
    return: isReturn
  };

  logger('Get distance between two points', data);

  if (cachedData) {
    logger('Distance data in cache', {
      data,
      cachedData
    });

    return Promise.resolve(cachedData);
  }

  return faasRequest({
    url: 'func_distance-finder',
    body: data
  }).then(metres => {
    /* Convert metres to miles */
    const miles = (metres * 100) / 160934;
    const roundedMiles = round(miles, 1);

    cache.set(key, roundedMiles);

    logger('Distance successfully retrieved', {
      data,
      roundedMiles
    });

    return roundedMiles;
  }).catch(err => {
    logger('Error retrieving distance', {
      err
    });

    return Promise.reject(err);
  });
}

function getEvents () {
  const timeMax = new Date();

  logger('Getting events from Google calendar', {
    timeMax
  });

  return faasRequest({
    url: 'func_google-calendar',
    body: {
      method: 'getCalendarEvents',
      args: {
        calendarId: config.google.calendarId,
        timeMax
      },
      refreshToken: config.google.token
    }
  }).then(res => {
    logger('Successfully retrieved calendar events', {
      timeMax
    });

    return res;
  }).catch(err => {
    logger('Error retrieving calendar events', {
      err,
      timeMax
    });

    return Promise.reject(err);
  });
}

function notifyUser (subject, text) {
  logger('Notifying user', {
    subject,
    text
  });

  return new Promise((resolve, reject) => {
    emailer.sendMail({
      from: config.notify.from,
      to: config.notify.to,
      subject: `${config.notify.subject}${subject}`,
      text
    }, (err, info) => {
      if (err) {
        logger('Error notifying user', {
          err,
          subject,
          text
        });

        reject(err);
        return;
      }

      logger('User notified successfully', {
        info,
        subject,
        text
      });

      resolve(info);
    });
  });
}

function round (value, precision = 0) {
  const multiplier = Math.pow(10, precision);
  return Math.round(value * multiplier) / multiplier;
}

Promise.resolve()
  /* First, get the events from Google Calendar */
  .then(() => getEvents())
  .then(result => result.reduce((thenable, event) => {
    const data = {
      id: event.id,
      date: new Date(event.start.date),
      description: event.summary,
      journey: yml.safeLoad(event.description)
    };

      /* Next, get the mileage for these journeys */
    return thenable
      .then(() => getDistance(
        data.journey.start,
        data.journey.dest,
        data.journey.return
      ))
      .then(miles => {
        /* Store the distance */
        data.mileage = miles;

        /* Now create this as an expense in FreeAgent */
        return createExpense(data);
      })
      .then(() => {
        /* Success - now delete the calendar event */
        return deleteEvent(data.id);
      })
      .catch((err) => {
        /* Catch error here to avoid breaking the flow */
        const text = JSON.stringify({
          data,
          err: err.stack
        }, null, 2);

        return notifyUser('Error whilst converting event to expense', text);
      });
  }, Promise.resolve()))
  /* Error getting the event list */
  .catch(err => notifyUser('Failed to get event list', err.stack));
