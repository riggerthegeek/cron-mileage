FROM node:8-alpine

ARG SUPERCRONIC_VERSION=0.1.5
ARG SUPERCRONIC_SHA1SUM=9aeb41e00cc7b71d30d33c57a2333f2c2581a201

ENV SUPERCRONIC=supercronic-linux-amd64

ENV CRON_SCHEDULE="0 2 * * *"
ENV CRON_COMMAND="node /home/node/app/mileage.js"

ENV CACHE_MAX=500
ENV CACHE_MAX_AGE=86400000
ENV FAAS_URL="http://192.168.0.150:8080"
ENV FREEAGENT_MILEAGE_CATEGORY_ID=249
ENV NOTIFY_SUBJECT="Cron Mileage - "

RUN apk add --no-cache curl \
  && curl -fsSLO "https://github.com/aptible/supercronic/releases/download/v${SUPERCRONIC_VERSION}/${SUPERCRONIC}" \
  && echo "${SUPERCRONIC_SHA1SUM}  ${SUPERCRONIC}" | sha1sum -c - \
  && chmod +x "$SUPERCRONIC" \
  && mv "$SUPERCRONIC" "/usr/local/bin/supercronic" \
  && apk del curl

WORKDIR /home/node/app

ADD crontab.sh .
ADD mileage.js .
ADD package.json .
ADD package-lock.json .

RUN chown node:node -Rf ./

RUN npm install --production

USER node

CMD [ "/bin/sh", "crontab.sh" ]
