FROM resin/armhf-alpine:3.6

ARG SUPERCRONIC_VERSION=0.1.5
ARG SUPERCRONIC_SHA1SUM=02039c3d4d7e74658be8f1ae911686dbc28c4a4a

ENV SUPERCRONIC=supercronic-linux-arm

WORKDIR /opt/cron

VOLUME /opt/cron

RUN [ "cross-build-start" ]

RUN apk add --no-cache curl \
  && curl -fsSLO "https://github.com/aptible/supercronic/releases/download/v${SUPERCRONIC_VERSION}/${SUPERCRONIC}" \
  && echo "${SUPERCRONIC_SHA1SUM}  ${SUPERCRONIC}" | sha1sum -c - \
  && chmod +x "$SUPERCRONIC" \
  && mv "$SUPERCRONIC" "/usr/local/bin/supercronic" \
  && apk del curl

CMD [ "supercronic", "/opt/cron/crontab" ]

RUN [ "cross-build-end" ]
