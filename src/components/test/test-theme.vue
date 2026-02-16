<template>
  <v-app>
    <v-main>
      <v-container>
        <!-- Toggle between Light / Dark -->
        <v-btn
          @click="theme.toggle()"
          text="Toggle Light / Dark"
        ></v-btn>

        <!-- Change to a specific theme -->
        <v-btn
          @click="theme.change('dark')"
          text="Change to Dark"
        ></v-btn>

        <!-- Cycle between all themes -->
        <v-btn
          @click="theme.cycle()"
          text="Cycle All Themes"
        ></v-btn>

        <!-- Cycle between specific themes -->
        <v-btn
          @click="theme.cycle(['custom', 'light', 'system'])"
          text="Cycle Specific Themes"
        ></v-btn>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup>
import { useTheme } from 'vuetify'

const theme = useTheme()
</script>
