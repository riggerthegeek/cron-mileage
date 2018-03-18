FROM python:3-alpine

ARG SUPERCRONIC_VERSION=0.1.5
ARG SUPERCRONIC_SHA1SUM=9aeb41e00cc7b71d30d33c57a2333f2c2581a201

ENV SUPERCRONIC=supercronic-linux-amd64

ENV CRON_SCHEDULE="* * * * *"
ENV CRON_COMMAND="python /opt/mileage.py"

WORKDIR /opt

VOLUME /opt/scripts

RUN apk add --no-cache curl \
  && curl -fsSLO "https://github.com/aptible/supercronic/releases/download/v${SUPERCRONIC_VERSION}/${SUPERCRONIC}" \
  && echo "${SUPERCRONIC_SHA1SUM}  ${SUPERCRONIC}" | sha1sum -c - \
  && chmod +x "$SUPERCRONIC" \
  && mv "$SUPERCRONIC" "/usr/local/bin/supercronic" \
  && apk del curl

CMD [ "/bin/sh", "/opt/crontab.sh" ]
