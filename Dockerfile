FROM node:22-alpine AS client
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY tools tools
COPY client client
COPY public public
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS server
WORKDIR /src
COPY Strata.slnx ./
COPY src src
RUN dotnet publish src/Strata.Server -c Release -o /out

FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine
WORKDIR /app
ENV PORT=3001 STRATA_DB=/data/strata.db DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true
COPY --from=server /out ./
COPY --from=client /app/dist ./dist
VOLUME /data
EXPOSE 3001
ENTRYPOINT ["dotnet", "Strata.Server.dll"]
